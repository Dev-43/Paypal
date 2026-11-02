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
import { executeTool } from "../env/tools";
import { getSensitivity, emailDomainAllowList } from "../env/policyData";
import { judgeAction } from "../watcher/watcher";

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

  // BASELINE MODE (Control group: only H1 and H2 run, no Watcher, no ratchet, no holds)
  if (mode === "baseline") {
    const hlStart = Date.now();
    // For baseline, only check H1 and H2
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

    const hlEvent = await appendEvent(runId, "hard_limit_checked", {
      mode: "baseline",
      passed: !baselineBlocked,
      message: baselineMsg || "Passed baseline checks H1-H2",
    });
    eventIds.push(hlEvent.id);

    if (baselineBlocked) {
      const blockedEvent = await appendEvent(runId, "action_blocked", {
        reason: baselineMsg,
        stepIndex: action.stepIndex,
      });
      eventIds.push(blockedEvent.id);

      return {
        outcome: "blocked",
        verdict: null,
        toolResult: null,
        message: baselineMsg,
        permissionVersion: state.version,
        eventIds,
        timings: {
          hardLimitMs,
          watcherMs: 0,
          totalMs: Date.now() - startTime,
        },
      };
    }

    // Execute tool directly
    try {
      const toolResult = await executeTool(action.tool, action.args, runId);
      const executedEvent = await appendEvent(runId, "action_executed", {
        tool: action.tool,
        stepIndex: action.stepIndex,
        success: true,
      });
      eventIds.push(executedEvent.id);

      return {
        outcome: "executed",
        verdict: null,
        toolResult,
        message: "Executed successfully (baseline mode).",
        permissionVersion: state.version,
        eventIds,
        timings: {
          hardLimitMs,
          watcherMs: 0,
          totalMs: Date.now() - startTime,
        },
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const errEvent = await appendEvent(runId, "error", { message: errMsg });
      eventIds.push(errEvent.id);
      throw err;
    }
  }

  // PROTECTED MODE (Full Taut Oversight Layer)

  // Step 1: If frozen -> outcome frozen, message "Run is frozen. A human must unfreeze it."
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
      timings: {
        hardLimitMs: 0,
        watcherMs: 0,
        totalMs: Date.now() - startTime,
      },
    };
  }

  // Step 2: Hard Limits H1-H6 in order
  const hlStart = Date.now();
  const hlCheck = checkHardLimits(action, state, emailDomainAllowList);
  hardLimitMs = Date.now() - hlStart;

  const hlEvent = await appendEvent(runId, "hard_limit_checked", {
    passed: hlCheck.passed,
    rule: hlCheck.rule,
    outcome: hlCheck.outcome,
    message: hlCheck.message,
  });
  eventIds.push(hlEvent.id);

  if (!hlCheck.passed) {
    if (hlCheck.outcome === "blocked") {
      const blockedEvent = await appendEvent(runId, "action_blocked", {
        rule: hlCheck.rule,
        message: hlCheck.message,
        stepIndex: action.stepIndex,
      });
      eventIds.push(blockedEvent.id);

      if (hlCheck.rule === "H6") {
        await prisma.run.update({
          where: { id: runId },
          data: { status: "completed" },
        });
        await appendEvent(runId, "run_completed", { reason: "Budget steps reached" });
      }

      return {
        outcome: "blocked",
        verdict: null,
        toolResult: null,
        message: hlCheck.message || "Action blocked by hard limit.",
        permissionVersion: state.version,
        eventIds,
        timings: {
          hardLimitMs,
          watcherMs: 0,
          totalMs: Date.now() - startTime,
        },
      };
    }

    if (hlCheck.outcome === "held") {
      // Hold for approval: update run status and heldAction
      await prisma.run.update({
        where: { id: runId },
        data: {
          status: "paused_held",
          heldAction: action as any,
        },
      });

      const heldEvent = await appendEvent(runId, "action_held", {
        rule: hlCheck.rule,
        message: hlCheck.message,
        heldAction: action,
      });
      eventIds.push(heldEvent.id);

      return {
        outcome: "held",
        verdict: null,
        toolResult: null,
        message: hlCheck.message || "Action held for human approver authorization.",
        permissionVersion: state.version,
        eventIds,
        timings: {
          hardLimitMs,
          watcherMs: 0,
          totalMs: Date.now() - startTime,
        },
      };
    }
  }

  // Step 3: Watcher Action Judgment
  const targetPath = (action.args.path as string) || (action.args.target as string) || "";
  const sensitivity = getSensitivity(targetPath);

  // Fetch recent events for context
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
      outcome: e.type.includes("executed")
        ? "executed"
        : e.type.includes("held")
        ? "held"
        : e.type.includes("blocked")
        ? "blocked"
        : "executed",
    };
  });

  // Find last read excerpt if available
  let lastReadExcerpt: string | null = null;
  const lastReadEvent = pastEvents.find(
    (e) => (e.payload as Record<string, unknown>).tool === "read_file"
  );
  if (lastReadEvent && (lastReadEvent.payload as Record<string, unknown>).excerpt) {
    lastReadExcerpt = (lastReadEvent.payload as Record<string, unknown>).excerpt as string;
  }

  const watcherInput: WatcherInput = {
    declaredTask: run.declaredTask,
    grants: state.grants,
    action,
    sensitivity,
    recentEvents,
    lastReadExcerpt,
  };

  let verdict: Verdict | null = null;
  const watcherStart = Date.now();

  try {
    const judgeFn = testWatcherOverride || judgeAction;
    const watcherResult = await judgeFn(watcherInput);
    watcherMs = Date.now() - watcherStart;

    verdict = watcherResult.verdict;

    // Log one watcher_called event per tier call
    for (const call of watcherResult.calls) {
      const callEv = await appendEvent(runId, "watcher_called", {
        tier: call.tier,
        model: call.model,
        decision: call.decision,
        confidence: call.confidence,
        tokensIn: call.tokensIn,
        tokensOut: call.tokensOut,
        costUsd: call.costUsd,
        latencyMs: call.latencyMs,
      });
      eventIds.push(callEv.id);
    }

    const verdictEv = await appendEvent(runId, "verdict_issued", {
      decision: watcherResult.verdict.decision,
      intentMatch: watcherResult.verdict.intentMatch,
      confidence: watcherResult.verdict.confidence,
      reasons: watcherResult.verdict.reasons,
      evidence: watcherResult.verdict.evidence,
      restrictionsCount: watcherResult.verdict.restrictions.length,
      tier: watcherResult.verdict.tier,
      model: watcherResult.verdict.model,
    });
    eventIds.push(verdictEv.id);
  } catch (err: unknown) {
    watcherMs = Date.now() - watcherStart;
    if (err instanceof WatcherUnavailableError) {
      // Fail closed: emit watcher_unavailable, outcome held
      const unavailEv = await appendEvent(runId, "watcher_unavailable", {
        error: err.message,
      });
      eventIds.push(unavailEv.id);

      await prisma.run.update({
        where: { id: runId },
        data: {
          status: "paused_held",
          heldAction: action as any,
        },
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
        timings: {
          hardLimitMs,
          watcherMs,
          totalMs: Date.now() - startTime,
        },
      };
    }
    throw err;
  }

  if (!verdict) {
    throw new Error("Unexpected state: Watcher verdict was not produced.");
  }

  // Step 4: Apply verdict
  if (verdict.decision === "freeze") {
    state = applyRestriction(state, { kind: "freeze_run" }, "watcher");
    await prisma.run.update({
      where: { id: runId },
      data: {
        status: "frozen",
        permissionState: state as any,
      },
    });

    const freezeEv = await appendEvent(runId, "run_frozen", {
      reasons: verdict.reasons,
      evidence: verdict.evidence,
    });
    eventIds.push(freezeEv.id);

    return {
      outcome: "frozen",
      verdict,
      toolResult: null,
      message: `Run frozen by Watcher: ${verdict.reasons.join("; ")}`,
      permissionVersion: state.version,
      eventIds,
      timings: {
        hardLimitMs,
        watcherMs,
        totalMs: Date.now() - startTime,
      },
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
        const restrEv = await appendEvent(runId, "restriction_applied", {
          restriction: valid,
          by: "watcher",
          version: state.version,
        });
        eventIds.push(restrEv.id);
      }
    }

    await prisma.run.update({
      where: { id: runId },
      data: {
        permissionState: state as any,
      },
    });

    const blockMsg = `Blocked: action flagged off-task. Applied restrictions: ${appliedNames.join(", ")}.`;
    const blockedEv = await appendEvent(runId, "action_blocked", {
      reason: blockMsg,
      reasons: verdict.reasons,
    });
    eventIds.push(blockedEv.id);

    return {
      outcome: "blocked",
      verdict,
      toolResult: null,
      message: blockMsg,
      permissionVersion: state.version,
      eventIds,
      timings: {
        hardLimitMs,
        watcherMs,
        totalMs: Date.now() - startTime,
      },
    };
  }

  // Step 5: For allow and warn -> executeTool
  try {
    const toolResult = await executeTool(action.tool, action.args, runId);

    // If path was sensitive, mark sensitiveRead = true
    if (sensitivity === "sensitive") {
      state.sensitiveRead = true;
      await prisma.run.update({
        where: { id: runId },
        data: {
          permissionState: state as any,
        },
      });
    }

    const execEv = await appendEvent(runId, "action_executed", {
      tool: action.tool,
      args: action.args,
      sensitivity,
      warning: verdict.decision === "warn",
    });
    eventIds.push(execEv.id);

    return {
      outcome: "executed",
      verdict,
      toolResult,
      message: verdict.decision === "warn" ? `Executed with warning: ${verdict.reasons.join("; ")}` : "Executed successfully.",
      permissionVersion: state.version,
      eventIds,
      timings: {
        hardLimitMs,
        watcherMs,
        totalMs: Date.now() - startTime,
      },
    };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const errEv = await appendEvent(runId, "error", { message: errMsg });
    eventIds.push(errEv.id);
    throw err;
  }
}
