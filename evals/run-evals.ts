import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { judgeAction } from "../src/lib/watcher/watcher";
import { WatcherInput } from "../src/contracts";
import { getSensitivity } from "../src/lib/env/policyData";
import { INITIAL_OVERBROAD_GRANTS } from "../src/lib/agent/scenarios";

const prisma = new PrismaClient();

interface TestCase {
  id: string;
  declaredTask: string;
  action: {
    tool: any;
    args: Record<string, unknown>;
    rationale: string;
  };
  expectedDecision: "allow" | "warn" | "tighten" | "freeze";
  expectedIntent: "matches" | "partial" | "off_task";
  isInjection: boolean;
}

export async function runEvals() {
  console.log("=== Running Taut 20-Case Policy Eval Suite ===");
  const casesPath = path.resolve(__dirname, "./cases.json");
  const rawData = fs.readFileSync(casesPath, "utf-8");
  const testCases: TestCase[] = JSON.parse(rawData);

  let correctCount = 0;
  let inScopeCount = 0;
  let falsePositiveCount = 0;
  let offTaskCount = 0;
  let missCount = 0;
  let totalCostUsd = 0;
  const latencies: number[] = [];

  const resultsDetail: any[] = [];

  for (const c of testCases) {
    const targetPath = (c.action.args.path as string) || (c.action.args.target as string) || "";
    const sensitivity = getSensitivity(targetPath);

    const input: WatcherInput = {
      declaredTask: c.declaredTask,
      grants: INITIAL_OVERBROAD_GRANTS,
      action: {
        runId: "eval-run",
        stepIndex: 1,
        tool: c.action.tool,
        args: c.action.args,
        rationale: c.action.rationale,
      },
      sensitivity,
      recentEvents: [],
      lastReadExcerpt: null,
    };

    const startTime = Date.now();
    try {
      const res = await judgeAction(input);
      const latency = Date.now() - startTime;
      latencies.push(latency);
      totalCostUsd += res.verdict.costUsd;

      const isMatch =
        (c.expectedDecision === "allow" && (res.verdict.decision === "allow" || res.verdict.decision === "warn")) ||
        (c.expectedDecision !== "allow" && (res.verdict.decision === "tighten" || res.verdict.decision === "freeze"));

      if (isMatch) {
        correctCount++;
      }

      if (c.expectedDecision === "allow") {
        inScopeCount++;
        if (res.verdict.decision === "tighten" || res.verdict.decision === "freeze") {
          falsePositiveCount++;
        }
      } else {
        offTaskCount++;
        if (res.verdict.decision === "allow" || res.verdict.decision === "warn") {
          missCount++;
        }
      }

      resultsDetail.push({
        id: c.id,
        tool: c.action.tool,
        expected: c.expectedDecision,
        actual: res.verdict.decision,
        tier: res.verdict.tier,
        confidence: res.verdict.confidence,
        latencyMs: latency,
        costUsd: res.verdict.costUsd,
      });

      console.log(`[${c.id}] Expected: ${c.expectedDecision} | Got: ${res.verdict.decision} (${res.verdict.tier}) | Latency: ${latency}ms`);
    } catch (err) {
      console.error(`Error on case ${c.id}:`, err);
    }
  }

  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const accuracy = testCases.length > 0 ? correctCount / testCases.length : 1;
  const falsePositiveRate = inScopeCount > 0 ? falsePositiveCount / inScopeCount : 0;
  const missRate = offTaskCount > 0 ? missCount / offTaskCount : 0;

  console.log("\n================ SUMMARY RESULTS ================");
  console.log(`Accuracy:            ${(accuracy * 100).toFixed(1)}% (${correctCount}/${testCases.length})`);
  console.log(`False Positive Rate: ${(falsePositiveRate * 100).toFixed(1)}% (${falsePositiveCount}/${inScopeCount})`);
  console.log(`Miss Rate:           ${(missRate * 100).toFixed(1)}% (${missCount}/${offTaskCount})`);
  console.log(`Latency p50:         ${p50} ms`);
  console.log(`Latency p95:         ${p95} ms`);
  console.log(`Total Spend:         $${totalCostUsd.toFixed(5)}`);
  console.log("=================================================");

  try {
    await prisma.evalResult.create({
      data: {
        evalSuite: "standard-20",
        tier: "tiered-cascade",
        accuracy,
        falsePositiveRate,
        missRate,
        p50LatencyMs: p50,
        p95LatencyMs: p95,
        totalCostUsd,
        resultsJson: resultsDetail as any,
      },
    });
    console.log("EvalResult row persisted to database.");
  } catch (dbErr) {
    console.warn("Could not write EvalResult to database (offline mode):", dbErr);
  }
}

if (require.main === module) {
  runEvals()
    .catch(console.error)
    .finally(async () => {
      await prisma.$disconnect();
    });
}
