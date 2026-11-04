import {
  GatewayCallInput,
  GatewayCallResult,
  PermissionState,
  Outcome,
  Verdict,
  WatcherUnavailableError,
  WatcherInput,
  RecentEventSummary,
} from "../../contracts";
import { prisma } from "../db";
import { checkHardLimits } from "../policy/hardLimits";
import {
  applyRestriction,
  validateRestriction,
} from "../policy/ratchet";
import { appendEvent } from "../audit/chain";
import { executeTool as executeLegacyTool } from "../env/tools";
import { getSensitivity, emailDomainAllowList } from "../env/policyData";
import { judgeAction } from "../watcher/watcher";
import { getRegistryEntry } from "../paypal/registry";
import { evaluateMoneyRules } from "../rules/money-rules";
import { executeTool as executePaypalTool } from "../paypal/executor";
import { performLedgerCheck } from "../ledger/check";
import { extractUntrustedText } from "./provenance";
import { briefIncident } from "../interpreter";

// Test hook strictly for unit tests to bypass external network calls
let testWatcherOverride: ((input: WatcherInput) => Promise<any>) | null = null;
export function setTestWatcherOverride(fn: ((input: WatcherInput) => Promise<any>) | null) {
  testWatcherOverride = fn;
}

export async function gatewayCall(input: GatewayCallInput): Promise<GatewayCallResult> {
  const startTime = Date.now();
  let hardLimitMs = 0;
  let watcherMs = 0;
  const eventIds: string[] = [];

  const { runId, mode, action } = input;

  // 1. Load run and permission state
  const run = await prisma.run.findUnique({
    where: { id: runId },
  });

  if (!run) {
    throw new Error(`Run not found: ${runId}`);
  }

  let state = run.permissionState as unknown as PermissionState;

  // Log action_proposed event
  const proposedEvent = await appendEvent(runId, "action_proposed", {
    tool: action.tool,
    args: action.args,
    stepIndex: action.stepIndex,
    rationale: action.rationale,
  });
  eventIds.push(proposedEvent.id);

  const registryEntry = getRegistryEntry(action.tool);

  // ==========================================
  // PAYPAL TOOL PIPELINE
  // ==========================================
  if (registryEntry) {
    // Check if run is frozen
    if (state.frozen) {
      const frozenEvent = await appendEvent(runId, "run_frozen", {
        reason: "Attempted action on a frozen run.",
        stepIndex: action.stepIndex,
      });
      eventIds.push(frozenEvent.id);

      return {
        outcome: "frozen",
        verdict: null,
        toolResult: null,
        message: "Run is frozen. A human must unfreeze it.",
        permissionVersion: state.version,
        eventIds,
        timings: { hardLimitMs: 0, watcherMs: 0, totalMs: Date.now() - startTime },
      };
    }

    // Check if tool is disabled
    if (state.disabledTools.includes(action.tool as any)) {
      const blockedEvent = await appendEvent(runId, "action_blocked", {
        reason: `Tool '${action.tool}' has been disabled by ratchet.`,
        stepIndex: action.stepIndex,
      });
      eventIds.push(blockedEvent.id);

      return {
        outcome: "blocked",
        verdict: null,
        toolResult: null,
        message: `Tool '${action.tool}' is disabled.`,
        permissionVersion: state.version,
        eventIds,
        timings: { hardLimitMs: 0, watcherMs: 0, totalMs: Date.now() - startTime },
      };
    }

    // Evaluate Deterministic Money Rules P1–P8
    const hlStart = Date.now();
    const ruleVerdict = await evaluateMoneyRules({
      runId,
      stepIndex: action.stepIndex,
      tool: action.tool,
      args: action.args,
      declaredScopeIds: (run as any).scopeIds || [],
      allowedTools: state.grants.map((g) => g.tool),
      accumulatedSpendMinor: 0,
    });
    hardLimitMs = Date.now() - hlStart;

    if (ruleVerdict.decision === "frozen") {
      state = applyRestriction(state, { kind: "freeze_run" }, "hard_limit");
      await prisma.run.update({
        where: { id: runId },
        data: { status: "frozen", permissionState: state as any },
      });
      const frozenEv = await appendEvent(runId, "run_frozen", {
        ruleId: ruleVerdict.ruleId,
        reason: ruleVerdict.reason,
      });
      eventIds.push(frozenEv.id);

      return {
        outcome: "frozen",
        verdict: null,
        toolResult: null,
        message: ruleVerdict.reason,
        permissionVersion: state.version,
        eventIds,
        timings: { hardLimitMs, watcherMs: 0, totalMs: Date.now() - startTime },
      };
    }

    if (ruleVerdict.decision === "blocked") {
      const blockedEv = await appendEvent(runId, "action_blocked", {
        ruleId: ruleVerdict.ruleId,
        reason: ruleVerdict.reason,
        stepIndex: action.stepIndex,
      });
      eventIds.push(blockedEv.id);

      return {
        outcome: "blocked",
        verdict: null,
        toolResult: null,
        message: ruleVerdict.reason,
        permissionVersion: state.version,
        eventIds,
        timings: { hardLimitMs, watcherMs: 0, totalMs: Date.now() - startTime },
      };
    }

    if (ruleVerdict.decision === "held" || state.approvalRequiredTools.includes(action.tool as any)) {
      // Hold for approval
      await prisma.run.update({
        where: { id: runId },
        data: {
          status: "paused_held",
          heldAction: action as any,
        },
      });

      // Create Approval record
      try {
        await (prisma as any).approval.create({
          data: {
            runId,
            callId: proposedEvent.id,
            action: action as any,
            status: "pending",
          },
        });
      } catch {
        // Best-effort
      }

      const heldEv = await appendEvent(runId, "action_held", {
        ruleId: ruleVerdict.ruleId,
        reason: ruleVerdict.reason,
        heldAction: action,
      });
      eventIds.push(heldEv.id);

      return {
        outcome: "held",
        verdict: null,
        toolResult: null,
        message: ruleVerdict.reason || "Action held for human approver authorization.",
        permissionVersion: state.version,
        eventIds,
        timings: { hardLimitMs, watcherMs: 0, totalMs: Date.now() - startTime },
      };
    }

    // BASELINE MODE: Executes directly once deterministic checks pass
    if (mode === "baseline") {
      const exec = await executePaypalTool(action);
      const execEv = await appendEvent(runId, "action_executed", {
        tool: action.tool,
        status: exec.status,
        result: exec.result,
      });
      eventIds.push(execEv.id);

      return {
        outcome: exec.status === "SUCCESS" ? "executed" : "blocked",
        verdict: null,
        toolResult: exec.result,
        message: exec.error || "Executed successfully (baseline mode).",
        permissionVersion: state.version,
        eventIds,
        timings: { hardLimitMs, watcherMs: 0, totalMs: Date.now() - startTime },
      };
    }

    // PROTECTED MODE: Evaluate Intent Watcher
    const pastEvents = await prisma.event.findMany({
      where: { runId },
      orderBy: { seq: "desc" },
      take: 10,
    });

    const recentEvents: RecentEventSummary[] = pastEvents.reverse().map((e) => {
      const payload = e.payload as Record<string, unknown>;
      return {
        tool: (payload.tool as any) || action.tool,
        target: String(payload.target || payload.id || "/"),
        outcome: e.type.includes("executed") ? "executed" : "blocked",
      };
    });

    // Collect untrusted text read so far
    const untrustedTextsRead: string[] = [];
    for (const e of pastEvents) {
      if (e.type === "action_executed") {
        const payload = e.payload as any;
        if (payload?.untrustedText && Array.isArray(payload.untrustedText)) {
          untrustedTextsRead.push(...payload.untrustedText);
        }
      }
    }

    const watcherInput: WatcherInput = {
      declaredTask: run.declaredTask,
      grants: state.grants,
      action,
      sensitivity: "internal",
      recentEvents,
      lastReadExcerpt: null,
      untrustedTextsRead,
    };

    let verdict: Verdict | null = null;
    const watcherStart = Date.now();

    try {
      const judgeFn = testWatcherOverride || judgeAction;
      const watcherResult = await judgeFn(watcherInput);
      watcherMs = Date.now() - watcherStart;
      verdict = watcherResult.verdict;

      const verdictEv = await appendEvent(runId, "verdict_issued", {
        decision: verdict.decision,
        intentMatch: verdict.intentMatch,
        confidence: verdict.confidence,
        reasons: verdict.reasons,
        evidence: verdict.evidence,
        tier: verdict.tier,
      });
      eventIds.push(verdictEv.id);
    } catch (err: unknown) {
      watcherMs = Date.now() - watcherStart;
      // Fail closed to HELD
      await prisma.run.update({
        where: { id: runId },
        data: { status: "paused_held", heldAction: action as any },
      });
      const heldEv = await appendEvent(runId, "action_held", {
        reason: "Watcher unavailable. Failing closed to held state.",
        heldAction: action,
      });
      eventIds.push(heldEv.id);

      return {
        outcome: "held",
        verdict: null,
        toolResult: null,
        message: "Held: Watcher service is currently unavailable. Held for manual authorization.",
        permissionVersion: state.version,
        eventIds,
        timings: { hardLimitMs, watcherMs, totalMs: Date.now() - startTime },
      };
    }

    // Apply Watcher Tighten or Freeze
    if (verdict?.decision === "freeze") {
      state = applyRestriction(state, { kind: "freeze_run" }, "watcher");
      await prisma.run.update({
        where: { id: runId },
        data: { status: "frozen", permissionState: state as any },
      });
      return {
        outcome: "frozen",
        verdict,
        toolResult: null,
        message: `Run frozen by Watcher: ${verdict.reasons.join("; ")}`,
        permissionVersion: state.version,
        eventIds,
        timings: { hardLimitMs, watcherMs, totalMs: Date.now() - startTime },
      };
    }

    if (verdict?.decision === "tighten") {
      for (const r of verdict.restrictions) {
        const valid = validateRestriction(r);
        if (valid) {
          state = applyRestriction(state, valid, "watcher");
        }
      }
      await prisma.run.update({
        where: { id: runId },
        data: { permissionState: state as any },
      });
      return {
        outcome: "blocked",
        verdict,
        toolResult: null,
        message: `Blocked by Watcher: ${verdict.reasons.join("; ")}`,
        permissionVersion: state.version,
        eventIds,
        timings: { hardLimitMs, watcherMs, totalMs: Date.now() - startTime },
      };
    }

    // Execution & Ledger Read-Back Check
    const exec = await executePaypalTool(action);
    const untrustedFields = extractUntrustedText(action.tool, exec.result);

    let ledgerCheckResult = null;
    if (registryEntry.class === "money_move") {
      ledgerCheckResult = await performLedgerCheck({
        callId: proposedEvent.id,
        envelope: action,
        executionStatus: exec.status,
        executionResult: exec.result,
        currentPermissionState: state,
      });

      state = ledgerCheckResult.nextPermissionState;

      if (ledgerCheckResult.check.status === "MISMATCH") {
        await prisma.run.update({
          where: { id: runId },
          data: { status: "frozen", permissionState: state as any },
        });

        // Trigger incident briefing
        try {
          await briefIncident(runId);
        } catch {
          // Best effort briefing
        }
      }
    }

    const execEv = await appendEvent(runId, "action_executed", {
      tool: action.tool,
      status: exec.status,
      result: exec.result,
      untrustedText: untrustedFields,
      ledgerCheck: ledgerCheckResult?.check || null,
    });
    eventIds.push(execEv.id);

    return {
      outcome: exec.status === "SUCCESS" ? "executed" : "blocked",
      verdict,
      toolResult: exec.result,
      message: exec.error || "Executed successfully under protected oversight.",
      permissionVersion: state.version,
      eventIds,
      timings: { hardLimitMs, watcherMs, totalMs: Date.now() - startTime },
    };
  }

  // ==========================================
  // LEGACY / MOCK TOOL PIPELINE (Ported tests compatibility)
  // ==========================================
  if (mode === "baseline") {
    const hlStart = Date.now();
    const toolGrants = state.grants.filter((g) => g.tool === action.tool);
    let baselineBlocked = false;
    let baselineMsg = "";

    if (state.disabledTools.includes(action.tool) || toolGrants.length === 0) {
      baselineBlocked = true;
      baselineMsg = `Blocked (H1): tool '${action.tool}' not permitted in baseline grants.`;
    } else if (
      action.tool === "read_file" ||
      action.tool === "write_file" ||
      action.tool === "list_files"
    ) {
      const targetPath = (action.args.path as string) || (action.args.target as string) || "";
      const allowedScopes = toolGrants.map((g) => g.scope);
      const inScope = allowedScopes.some((s) => s === "*" || targetPath.startsWith(s));
      if (!inScope) {
        baselineBlocked = true;
        baselineMsg = `Blocked (H2): path '${targetPath}' outside baseline scope.`;
      }
    }
    hardLimitMs = Date.now() - hlStart;

    if (baselineBlocked) {
      return {
        outcome: "blocked",
        verdict: null,
        toolResult: null,
        message: baselineMsg,
        permissionVersion: state.version,
        eventIds,
        timings: { hardLimitMs, watcherMs: 0, totalMs: Date.now() - startTime },
      };
    }

    const toolResult = await executeLegacyTool(action.tool, action.args, runId);
    return {
      outcome: "executed",
      verdict: null,
      toolResult,
      message: "Executed successfully (baseline mode).",
      permissionVersion: state.version,
      eventIds,
      timings: { hardLimitMs, watcherMs: 0, totalMs: Date.now() - startTime },
    };
  }

  // Legacy Protected Mode
  if (state.frozen) {
    return {
      outcome: "frozen",
      verdict: null,
      toolResult: null,
      message: "Run is frozen. A human must unfreeze it.",
      permissionVersion: state.version,
      eventIds,
      timings: { hardLimitMs: 0, watcherMs: 0, totalMs: Date.now() - startTime },
    };
  }

  const hlStart = Date.now();
  const hlCheck = checkHardLimits(action, state, emailDomainAllowList);
  hardLimitMs = Date.now() - hlStart;

  if (!hlCheck.passed) {
    if (hlCheck.outcome === "blocked") {
      return {
        outcome: "blocked",
        verdict: null,
        toolResult: null,
        message: hlCheck.message || "Action blocked by hard limit.",
        permissionVersion: state.version,
        eventIds,
        timings: { hardLimitMs, watcherMs: 0, totalMs: Date.now() - startTime },
      };
    }
    if (hlCheck.outcome === "held") {
      await prisma.run.update({
        where: { id: runId },
        data: { status: "paused_held", heldAction: action as any },
      });
      return {
        outcome: "held",
        verdict: null,
        toolResult: null,
        message: hlCheck.message || "Action held for human approver authorization.",
        permissionVersion: state.version,
        eventIds,
        timings: { hardLimitMs, watcherMs: 0, totalMs: Date.now() - startTime },
      };
    }
  }

  const targetPath = (action.args.path as string) || (action.args.target as string) || "";
  const sensitivity = getSensitivity(targetPath);

  const pastEvents = await prisma.event.findMany({
    where: { runId },
    orderBy: { seq: "desc" },
    take: 10,
  });

  const recentEvents: RecentEventSummary[] = pastEvents.reverse().map((e) => {
    const payload = e.payload as Record<string, unknown>;
    return {
      tool: (payload.tool as any) || action.tool,
      target: (payload.path as string) || (payload.to as string) || targetPath || "/",
      outcome: "executed",
    };
  });

  const watcherInput: WatcherInput = {
    declaredTask: run.declaredTask,
    grants: state.grants,
    action,
    sensitivity,
    recentEvents,
    lastReadExcerpt: null,
  };

  const watcherStart = Date.now();
  try {
    const judgeFn = testWatcherOverride || judgeAction;
    const watcherResult = await judgeFn(watcherInput);
    watcherMs = Date.now() - watcherStart;
    const verdict = watcherResult.verdict;

    if (verdict.decision === "freeze") {
      state = applyRestriction(state, { kind: "freeze_run" }, "watcher");
      return {
        outcome: "frozen",
        verdict,
        toolResult: null,
        message: `Run frozen by Watcher: ${verdict.reasons.join("; ")}`,
        permissionVersion: state.version,
        eventIds,
        timings: { hardLimitMs, watcherMs, totalMs: Date.now() - startTime },
      };
    }

    if (verdict.decision === "tighten") {
      const appliedNames: string[] = [];
      for (const r of verdict.restrictions) {
        const valid = validateRestriction(r);
        if (valid) {
          state = applyRestriction(state, valid, "watcher");
          appliedNames.push(
            valid.kind === "revoke_scope"
              ? `revoked ${valid.tool} ${valid.scope}`
              : valid.kind
          );
        }
      }
      return {
        outcome: "blocked",
        verdict,
        toolResult: null,
        message: `Blocked: action flagged off-task. Applied restrictions: ${appliedNames.join(", ")}.`,
        permissionVersion: state.version,
        eventIds,
        timings: { hardLimitMs, watcherMs, totalMs: Date.now() - startTime },
      };
    }

    const toolResult = await executeLegacyTool(action.tool, action.args, runId);
    return {
      outcome: "executed",
      verdict,
      toolResult,
      message: "Executed successfully.",
      permissionVersion: state.version,
      eventIds,
      timings: { hardLimitMs, watcherMs, totalMs: Date.now() - startTime },
    };
  } catch (err: unknown) {
    watcherMs = Date.now() - watcherStart;
    if (err instanceof WatcherUnavailableError) {
      return {
        outcome: "held",
        verdict: null,
        toolResult: null,
        message: "Held: Watcher service is currently unavailable. Held for manual authorization.",
        permissionVersion: state.version,
        eventIds,
        timings: { hardLimitMs, watcherMs, totalMs: Date.now() - startTime },
      };
    }
    throw err;
  }
}

