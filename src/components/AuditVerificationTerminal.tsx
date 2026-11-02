"use client";

interface AuditVerificationTerminalProps {
  recentRuns: any[] | undefined;
  auditResults: Record<string, any>;
  verifyingId: string | null;
  onVerifyRun: (runId: string) => void;
}

export default function AuditVerificationTerminal({
  recentRuns,
  auditResults,
  verifyingId,
  onVerifyRun,
}: AuditVerificationTerminalProps) {
  if (!recentRuns || recentRuns.length === 0) {
    return (
      <div className="p-6 text-center text-xs text-zinc-500 bg-[#08090c] rounded-xl border border-zinc-800">
        No runs recorded yet. Launch a scenario on the Compare page first.
      </div>
    );
  }

  return (
    <div className="divide-y divide-zinc-800 bg-[#08090c] rounded-xl border border-zinc-800 overflow-hidden">
      {recentRuns.map((r: any) => {
        const result = auditResults[r.id];
        const isVerifying = verifyingId === r.id;

        return (
          <div
            key={r.id}
            className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
          >
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <span className="font-mono text-zinc-100 font-bold">{r.id}</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-900 border border-zinc-800 text-zinc-300">
                  {r.scenarioId} ({r.mode})
                </span>
                <span
                  className={`text-[10px] font-mono font-bold uppercase ${
                    r.status === "frozen"
                      ? "text-rose-400"
                      : r.status === "paused_held"
                      ? "text-amber-400"
                      : "text-emerald-400"
                  }`}
                >
                  {r.status}
                </span>
              </div>
              <div className="text-zinc-500 text-[11px] font-mono">
                Steps: {r.stepCount} • {new Date(r.createdAt).toLocaleString()}
              </div>
            </div>

            <div className="flex items-center space-x-3">
              {result && (
                <div
                  className={`px-3 py-1 rounded-lg text-[11px] font-mono font-bold border ${
                    result.ok
                      ? "bg-emerald-950 text-emerald-400 border-emerald-800"
                      : "bg-rose-950 text-rose-400 border-rose-800"
                  }`}
                >
                  {result.ok
                    ? `✓ SHA-256 Verified (${result.count} blocks intact)`
                    : `✗ Broken at seq #${result.brokenAtSeq}`}
                </div>
              )}

              <button
                onClick={() => onVerifyRun(r.id)}
                disabled={isVerifying}
                className="px-3.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 font-semibold text-xs border border-zinc-800 transition-colors"
              >
                {isVerifying ? "Verifying..." : "Verify Chain"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
