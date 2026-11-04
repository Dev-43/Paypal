import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/db";
import { checkSpendAndRate, recordIpRun, hashIp } from "../../../lib/guards/spend";
import { getScenario } from "../../../lib/scenarios/definitions";
import { createInitialPermissionState } from "../../../lib/agent/scenarios";
import { appendEvent } from "../../../lib/audit/chain";
import { Mode } from "../../../contracts";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || req.ip || "127.0.0.1";

    // 1. Guard check: spend cap and rate limit (10 runs per hour per IP)
    const guard = await checkSpendAndRate(ip);
    if (!guard.ok) {
      return NextResponse.json(
        { error: { code: "RATE_LIMIT_EXCEEDED", message: guard.message } },
        { status: 429 }
      );
    }

    const body = await req.json();
    const scenarioId = body.scenarioId || "custom";
    const mode = (body.mode || "protected") as Mode;
    const customTask = body.task as string | undefined;
    const attackerText = body.attackerText as string | undefined;

    if (mode !== "baseline" && mode !== "protected") {
      return NextResponse.json(
        { error: { code: "INVALID_MODE", message: `Invalid mode: ${mode}` } },
        { status: 400 }
      );
    }

    const scenario = getScenario(scenarioId);
    const declaredTask = customTask || scenario.task;
    const initialPermissionState = createInitialPermissionState();
    const ipHash = hashIp(ip);

    // Record IP run rate limit
    await recordIpRun(ip);

    // Create Run record
    const run = await prisma.run.create({
      data: {
        scenarioId,
        mode,
        declaredTask,
        status: "created",
        stepCount: 0,
        permissionState: initialPermissionState as any,
        ipHash,
      },
    });

    // Append run_started audit event
    await appendEvent(run.id, "run_started", {
      scenarioId,
      mode,
      declaredTask,
      attackerText: attackerText || scenario.attackerText || null,
      scopeIds: scenario.scopeIds,
      model: body.model || "nvidia/nemotron-3-super-120b-a12b",
    });

    return NextResponse.json({ runId: run.id }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}
