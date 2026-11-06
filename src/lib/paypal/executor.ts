/**
 * PayPal Toolkit Executor (Task 1.5)
 * Dispatches approved actions to PayPal agent toolkit tools in sandbox.
 * Enforces a strict 15-second execution timeout.
 * - Read tools may retry once on network error.
 * - money_move tools NEVER retry; ambiguous/timeout errors are marked UNVERIFIABLE.
 */

import { getRegistryEntry } from "./registry";
import { assertSandboxEnv } from "./token";

export interface ToolCallEnvelope {
  runId: string;
  stepIndex: number;
  tool: string;
  args: Record<string, unknown>;
  rationale: string;
}

export type ExecutionStatus = "SUCCESS" | "FAILED" | "UNVERIFIABLE";

export interface ExecutionResult {
  tool: string;
  status: ExecutionStatus;
  result?: unknown;
  error?: string;
  retries: number;
  executionTimeMs: number;
}

const EXECUTION_TIMEOUT_MS = 15000;

export class ExecutionTimeoutError extends Error {
  constructor(tool: string, timeoutMs: number) {
    super(`Execution timed out after ${timeoutMs}ms for tool '${tool}'`);
    this.name = "ExecutionTimeoutError";
  }
}

// In-memory toolkit instance cache
let toolkitInstance: any = null;

export function getOrCreateToolkit(): any {
  assertSandboxEnv();
  if (toolkitInstance) return toolkitInstance;

  try {
    // Dynamic import of @paypal/agent-toolkit/openai
    const { PayPalAgentToolkit, ALL_TOOLS_ENABLED } = require("@paypal/agent-toolkit/openai");
    toolkitInstance = new PayPalAgentToolkit({
      clientId: process.env.PAYPAL_CLIENT_ID || "mock_client",
      clientSecret: process.env.PAYPAL_CLIENT_SECRET || "mock_secret",
      configuration: {
        actions: ALL_TOOLS_ENABLED,
        context: { sandbox: true },
      },
    });
    return toolkitInstance;
  } catch (err: any) {
    throw new Error(`Failed to initialize PayPalAgentToolkit: ${err.message}`);
  }
}

export function setToolkitInstanceForTesting(mockToolkit: any): void {
  toolkitInstance = mockToolkit;
}

async function runWithTimeout<T>(
  promiseFactory: () => Promise<T>,
  timeoutMs: number,
  toolName: string
): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new ExecutionTimeoutError(toolName, timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promiseFactory(), timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function isNetworkError(err: any): boolean {
  if (!err) return false;
  const msg = (err.message || "").toLowerCase();
  return (
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("econnrefused") ||
    msg.includes("network error") ||
    msg.includes("socket hang up") ||
    (err.status >= 500 && err.status < 600)
  );
}

export async function executeTool(
  envelope: ToolCallEnvelope,
  overrideTimeoutMs = EXECUTION_TIMEOUT_MS
): Promise<ExecutionResult> {
  assertSandboxEnv();

  const entry = getRegistryEntry(envelope.tool);
  if (!entry) {
    return {
      tool: envelope.tool,
      status: "FAILED",
      error: `Tool '${envelope.tool}' is not recognized in the registry.`,
      retries: 0,
      executionTimeMs: 0,
    };
  }

  const isMoneyMove = entry.class === "money_move";
  const toolkit = getOrCreateToolkit();
  const toolFn = typeof toolkit.executeTool === "function"
    ? (args: any) => toolkit.executeTool(envelope.tool, args)
    : typeof toolkit.handleToolCall === "function"
    ? async (args: any) => {
        const res = await toolkit.handleToolCall({
          id: `call_${Date.now()}`,
          type: "function",
          function: {
            name: envelope.tool,
            arguments: JSON.stringify(args || {}),
          },
        });
        if (typeof res?.content === "string") {
          try {
            return JSON.parse(res.content);
          } catch {
            return res.content;
          }
        }
        return res?.content ?? res;
      }
    : typeof toolkit[envelope.tool] === "function"
    ? (args: any) => toolkit[envelope.tool](args)
    : async (args: any) => {
        // Fallback for toolkit tools exposed via getTools()
        const tools = toolkit.getTools ? toolkit.getTools() : [];
        const found = tools.find((t: any) => t?.function?.name === envelope.tool);
        if (found && typeof found.function?.invoke === "function") {
          return found.function.invoke(args);
        }
        throw new Error(`Tool function '${envelope.tool}' not found on toolkit instance.`);
      };

  const startTime = Date.now();
  let retries = 0;

  try {
    const result = await runWithTimeout(
      () => toolFn(envelope.args),
      overrideTimeoutMs,
      envelope.tool
    );

    return {
      tool: envelope.tool,
      status: "SUCCESS",
      result,
      retries,
      executionTimeMs: Date.now() - startTime,
    };
  } catch (error: any) {
    const isTimeout = error instanceof ExecutionTimeoutError || (error.message || "").includes("timed out");

    // SAFETY RULE: money_move NEVER retries! Ambiguous or timed out money calls fail UNVERIFIABLE.
    if (isMoneyMove) {
      if (isTimeout || isNetworkError(error)) {
        return {
          tool: envelope.tool,
          status: "UNVERIFIABLE",
          error: `Ambiguous result on money_move: ${error.message}. Marked UNVERIFIABLE to trigger read-back.`,
          retries: 0,
          executionTimeMs: Date.now() - startTime,
        };
      }
      return {
        tool: envelope.tool,
        status: "FAILED",
        error: error.message || "Execution error",
        retries: 0,
        executionTimeMs: Date.now() - startTime,
      };
    }

    // Read tools may retry once on network error (but not timeout)
    if (!isTimeout && isNetworkError(error)) {
      retries = 1;
      try {
        const result = await runWithTimeout(
          () => toolFn(envelope.args),
          overrideTimeoutMs,
          envelope.tool
        );
        return {
          tool: envelope.tool,
          status: "SUCCESS",
          result,
          retries: 1,
          executionTimeMs: Date.now() - startTime,
        };
      } catch (retryError: any) {
        return {
          tool: envelope.tool,
          status: "FAILED",
          error: `Retry failed: ${retryError.message}`,
          retries: 1,
          executionTimeMs: Date.now() - startTime,
        };
      }
    }

    return {
      tool: envelope.tool,
      status: "FAILED",
      error: error.message || "Execution error",
      retries: 0,
      executionTimeMs: Date.now() - startTime,
    };
  }
}
