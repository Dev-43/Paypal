import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/db";
import { checkSpendAndRate, recordIpRun, hashIp } from "../../../lib/guards/spend";
import { SCENARIOS, createInitialPermissionState } from "../../../lib/agent/scenarios";
import { appendEvent } from "../../../lib/audit/chain";
import { ScenarioId, Mode } from "../../../contracts";

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || req.ip || "127.0.0.1";

    // 1. Guard check: spend cap and rate limit
    const guard = await checkSpendAndRate(ip);
    if (!guard.ok) {
      return NextResponse.json(
        { error: { code: "BUDGET_OR_RATE_LIMIT", message: guard.message } },
        { status: 429 }
      );
    }

    const body = await req.json();
    const scenarioId = body.scenarioId as ScenarioId;
    const mode = body.mode as Mode;

    if (!scenarioId || !SCENARIOS[scenarioId]) {
      return NextResponse.json(
        { error: { code: "INVALID_SCENARIO", message: `Invalid scenarioId: ${scenarioId}` } },
        { status: 400 }
      );
    }

    if (mode !== "baseline" && mode !== "protected") {
      return NextResponse.json(
        { error: { code: "INVALID_MODE", message: `Invalid mode: ${mode}` } },
        { status: 400 }
      );
    }

    const scenario = SCENARIOS[scenarioId];
    const initialPermissionState = createInitialPermissionState();
    const ipHash = hashIp(ip);

    // Record IP run rate limit
    await recordIpRun(ip);

    // Create Run record
    const run = await prisma.run.create({
      data: {
        scenarioId,
        mode,
        declaredTask: scenario.declaredTask,
        status: "created",
        stepCount: 0,
        permissionState: initialPermissionState as any,
        ipHash,
      },
    });

    // Append run_started audit event
    await appendEvent(run.id, "run_started", {
      scenarioId,
      scenarioName: scenario.name,
      mode,
      declaredTask: scenario.declaredTask,
      initialGrants: initialPermissionState.grants,
    });

    return NextResponse.json({
      run: {
        id: run.id,
        scenarioId: run.scenarioId,
        mode: run.mode,
        declaredTask: run.declaredTask,
        status: run.status,
        stepCount: run.stepCount,
        heldAction: run.heldAction,
        createdAt: run.createdAt.toISOString(),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}
