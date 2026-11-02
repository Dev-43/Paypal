import { NextResponse } from "next/server";
import { prisma } from "../../../lib/db";

export async function GET() {
  try {
    // 1. Aggregate from SpendLedger
    const ledgerRows = await prisma.spendLedger.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    const callsByTier: Record<string, number> = {
      nano: 0,
      super: 0,
      ultra: 0,
      agent: 0,
    };

    const latenciesByTier: Record<string, number[]> = {
      nano: [],
      super: [],
      ultra: [],
      agent: [],
    };

    let totalCostUsd = 0;

    for (const row of ledgerRows) {
      const tier = row.tier.toLowerCase();
      callsByTier[tier] = (callsByTier[tier] || 0) + 1;
      if (latenciesByTier[tier]) {
        latenciesByTier[tier].push(row.latencyMs);
      }
      totalCostUsd += row.costUsd;
    }

    const tierStats: Record<string, { calls: number; p50: number; p95: number }> = {};
    for (const tier of ["nano", "super", "ultra", "agent"]) {
      const arr = latenciesByTier[tier] || [];
      arr.sort((a, b) => a - b);
      const p50 = arr.length > 0 ? arr[Math.floor(arr.length * 0.5)] : 0;
      const p95 = arr.length > 0 ? arr[Math.floor(arr.length * 0.95)] : 0;
      tierStats[tier] = {
        calls: callsByTier[tier] || 0,
        p50,
        p95,
      };
    }

    // 2. Count Holds, Tightenings, and Freezes from Events
    const holdsCount = await prisma.event.count({
      where: { type: "action_held" },
    });
    const tightenCount = await prisma.event.count({
      where: { type: "restriction_applied" },
    });
    const freezeCount = await prisma.event.count({
      where: { type: "run_frozen" },
    });

    // 3. Recent Runs
    const recentRuns = await prisma.run.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        scenarioId: true,
        mode: true,
        status: true,
        stepCount: true,
        createdAt: true,
      },
    });

    // 4. Latest Eval Results
    const latestEval = await prisma.evalResult.findFirst({
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      summary: {
        totalCostUsd: Math.round(totalCostUsd * 100000) / 100000,
        holdsCount,
        tightenCount,
        freezeCount,
      },
      tierStats,
      recentRuns: recentRuns.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
      })),
      latestEval: latestEval
        ? {
            ...latestEval,
            createdAt: latestEval.createdAt.toISOString(),
          }
        : null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json(
      { error: { code: "METRICS_FETCH_FAILED", message } },
      { status: 500 }
    );
  }
}
