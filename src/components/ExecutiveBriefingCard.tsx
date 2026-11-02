"use client";

import { Briefing } from "../contracts";

interface ExecutiveBriefingCardProps {
  briefing: Briefing | null;
  loadingBriefing: boolean;
  onSelectCitation: (citeId: string) => void;
}

export default function ExecutiveBriefingCard({
  briefing,
  loadingBriefing,
  onSelectCitation,
}: ExecutiveBriefingCardProps) {
  if (!briefing && !loadingBriefing) return null;

  return (
    <div className="p-4 rounded-xl bg-[#100c1a] border border-purple-800/80 space-y-3">
      <div className="flex items-center justify-between text-xs border-b border-purple-900/60 pb-2">
        <span className="font-bold text-purple-300">
          Executive Incident Briefing (Nemotron Ultra)
        </span>
        <span className="text-purple-400 font-mono text-[10px]">
          &le; 120 words • Cites Audit Trail
        </span>
      </div>

      {loadingBriefing ? (
        <div className="py-4 text-center text-xs text-purple-300 animate-pulse font-mono">
          Synthesizing incident briefing from SHA-256 audit chain...
        </div>
      ) : (
        briefing && (
          <div className="text-xs space-y-2 text-zinc-300">
            <p>
              <strong className="text-white">Incident:</strong> {briefing.whatHappened}
            </p>
            <p>
              <strong className="text-white">Why Flagged:</strong> {briefing.whyFlagged}
            </p>
            <p>
              <strong className="text-white">Enforcement:</strong> {briefing.whatWasRestricted}
            </p>
            <div className="pt-1">
              <strong className="text-white">Approver Options:</strong>
              <ul className="list-disc list-inside mt-0.5 space-y-0.5 text-zinc-400">
                {briefing.humanOptions.map((opt, i) => (
                  <li key={i}>{opt}</li>
                ))}
              </ul>
            </div>
            {briefing.cites.length > 0 && (
              <div className="pt-2 border-t border-purple-900/40 flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] text-purple-400 font-mono uppercase font-semibold">
                  Citations:
                </span>
                {briefing.cites.map((citeId) => (
                  <button
                    key={citeId}
                    onClick={() => onSelectCitation(citeId)}
                    className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-950 hover:bg-purple-900 text-purple-300 border border-purple-800 transition-colors"
                  >
                    {citeId}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
}
