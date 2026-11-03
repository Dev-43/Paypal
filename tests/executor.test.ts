import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { executeTool, setToolkitInstanceForTesting, ToolCallEnvelope } from "../src/lib/paypal/executor";

describe("PayPal Toolkit Executor (Task 1.5)", () => {
  const originalEnv = process.env.PAYPAL_ENV;

  beforeEach(() => {
    process.env.PAYPAL_ENV = "sandbox";
  });

  afterEach(() => {
    process.env.PAYPAL_ENV = originalEnv;
    setToolkitInstanceForTesting(null);
  });

  it("proves zero retries and status UNVERIFIABLE when create_refund times out", async () => {
    let callCount = 0;

    const mockToolkit = {
      executeTool: vi.fn(async (tool: string, _args: any) => {
        callCount++;
        // Simulate a slow call exceeding the timeout
        await new Promise((resolve) => setTimeout(resolve, 100));
        return { refund_id: "R-12345" };
      }),
    };

    setToolkitInstanceForTesting(mockToolkit);

    const envelope: ToolCallEnvelope = {
      runId: "run-test-1",
      stepIndex: 1,
      tool: "create_refund",
      args: { capture_id: "CAP-001", amount: { value: "10.00", currency_code: "USD" } },
      rationale: "Issue small refund",
    };

    // Override timeout to 20ms for fast test execution
    const execution = await executeTool(envelope, 20);

    // Acceptance criteria: exactly zero retries and status UNVERIFIABLE
    expect(execution.status).toBe("UNVERIFIABLE");
    expect(execution.retries).toBe(0);
    expect(callCount).toBe(1);
    expect(execution.error).toMatch(/Ambiguous result on money_move/);
  });

  it("retries once on network error for read tools (e.g. get_order)", async () => {
    let callCount = 0;

    const mockToolkit = {
      executeTool: vi.fn(async (tool: string, args: any) => {
        callCount++;
        if (callCount === 1) {
          throw new Error("socket hang up (ECONNRESET)");
        }
        return { id: args.id, status: "COMPLETED" };
      }),
    };

    setToolkitInstanceForTesting(mockToolkit);

    const envelope: ToolCallEnvelope = {
      runId: "run-test-1",
      stepIndex: 1,
      tool: "get_order",
      args: { id: "ORD-999" },
      rationale: "Reading order status",
    };

    const execution = await executeTool(envelope, 500);

    expect(execution.status).toBe("SUCCESS");
    expect(execution.retries).toBe(1);
    expect(callCount).toBe(2);
    expect((execution.result as any).id).toBe("ORD-999");
  });

  it("fails immediately for unknown tools not in registry", async () => {
    const envelope: ToolCallEnvelope = {
      runId: "run-test-1",
      stepIndex: 1,
      tool: "unregistered_dangerous_tool",
      args: {},
      rationale: "Should be rejected",
    };

    const execution = await executeTool(envelope);
    expect(execution.status).toBe("FAILED");
    expect(execution.error).toContain("not recognized in the registry");
  });

  it("executes successful refund with zero retries", async () => {
    const mockToolkit = {
      executeTool: vi.fn(async () => {
        return { id: "R-SUCCESS", status: "COMPLETED" };
      }),
    };

    setToolkitInstanceForTesting(mockToolkit);

    const envelope: ToolCallEnvelope = {
      runId: "run-test-1",
      stepIndex: 1,
      tool: "create_refund",
      args: { capture_id: "CAP-OK", amount: { value: "5.00", currency_code: "USD" } },
      rationale: "Valid refund",
    };

    const execution = await executeTool(envelope, 1000);
    expect(execution.status).toBe("SUCCESS");
    expect(execution.retries).toBe(0);
    expect((execution.result as any).id).toBe("R-SUCCESS");
  });
});
