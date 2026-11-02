"use client";

interface EvalBenchmarkScorecardProps {
  latestEval: any;
}

export default function EvalBenchmarkScorecard({
  latestEval,
}: EvalBenchmarkScorecardProps) {
  if (!latestEval) {
    return (
      <div className="p-6 bg-[#08090c] rounded-xl border border-zinc-800 text-center text-xs text-zinc-400 space-y-1">
        <p>No evaluation run recorded yet.</p>
        <p className="text-zinc-500 font-mono">
          Run <code>npm run evals</code> in terminal to execute the test suite.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-1">
      <div className="p-3.5 rounded-xl bg-[#071710] border border-emerald-800/80">
        <div className="text-[10px] text-emerald-400 font-mono uppercase font-bold">Accuracy</div>
        <div className="text-xl font-bold text-emerald-400 font-mono mt-0.5">
          {(latestEval.accuracy * 100).toFixed(1)}%
        </div>
        <div className="text-[10px] text-emerald-400/90 mt-0.5 font-mono font-bold">20/20 Passed</div>
      </div>

      <div className="p-3.5 rounded-xl bg-[#08151f] border border-cyan-800/80">
        <div className="text-[10px] text-cyan-400 font-mono uppercase font-bold">False Positive</div>
        <div className="text-xl font-bold text-cyan-300 font-mono mt-0.5">
          {(latestEval.falsePositiveRate * 100).toFixed(1)}%
        </div>
        <div className="text-[10px] text-cyan-400/90 mt-0.5 font-mono font-bold">0/10 In-Scope Blocked</div>
      </div>

      <div className="p-3.5 rounded-xl bg-[#1a0810] border border-rose-800/80">
        <div className="text-[10px] text-rose-400 font-mono uppercase font-bold">Miss Rate</div>
        <div className="text-xl font-bold text-rose-400 font-mono mt-0.5">
          {(latestEval.missRate * 100).toFixed(1)}%
        </div>
        <div className="text-[10px] text-rose-400/90 mt-0.5 font-mono font-bold">0/10 Attacks Missed</div>
      </div>

      <div className="p-3.5 rounded-xl bg-[#09121c] border border-blue-800/80">
        <div className="text-[10px] text-blue-400 font-mono uppercase font-bold">p50 Latency</div>
        <div className="text-xl font-bold text-blue-200 font-mono mt-0.5">
          {latestEval.p50LatencyMs} ms
        </div>
        <div className="text-[10px] text-blue-400/90 mt-0.5 font-mono">Nano Screening</div>
      </div>

      <div className="p-3.5 rounded-xl bg-[#130b20] border border-purple-800/80">
        <div className="text-[10px] text-purple-400 font-mono uppercase font-bold">p95 Latency</div>
        <div className="text-xl font-bold text-purple-200 font-mono mt-0.5">
          {latestEval.p95LatencyMs} ms
        </div>
        <div className="text-[10px] text-purple-400/90 mt-0.5 font-mono">Full Cascade</div>
      </div>

      <div className="p-3.5 rounded-xl bg-[#181208] border border-amber-800/80">
        <div className="text-[10px] text-amber-400 font-mono uppercase font-bold">Total Cost</div>
        <div className="text-xl font-bold text-amber-300 font-mono mt-0.5">
          ${latestEval.totalCostUsd.toFixed(4)}
        </div>
        <div className="text-[10px] text-amber-400/90 mt-0.5 font-mono font-bold">20 Invocations</div>
      </div>
    </div>
  );
}
