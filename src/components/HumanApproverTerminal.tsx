"use client";

import React from "react";

interface HumanApproverTerminalProps {
  isApprover: boolean;
  passcode: string;
  setPasscode: (val: string) => void;
  onApproverLogin: (e: React.FormEvent) => void;
  onHumanAction: (req: any) => void;
  protectedRunStatus: string | undefined;
  isFrozen: boolean;
  ruleText: string;
  setRuleText: (val: string) => void;
  onDraftRule: () => void;
  ruleMessage: string;
  draftedRule: any;
  onActivateRule: () => void;
  loginError: string;
}

export default function HumanApproverTerminal({
  isApprover,
  passcode,
  setPasscode,
  onApproverLogin,
  onHumanAction,
  protectedRunStatus,
  isFrozen,
  ruleText,
  setRuleText,
  onDraftRule,
  ruleMessage,
  draftedRule,
  onActivateRule,
  loginError,
}: HumanApproverTerminalProps) {
  return (
    <div className="p-4 rounded-xl bg-[#09151e] border border-cyan-900/80 space-y-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-[10px] font-mono text-cyan-400 uppercase font-semibold">
          Human Approver Console
        </span>
        <span
          className={`text-[11px] font-mono font-bold ${
            isApprover ? "text-emerald-400" : "text-amber-400"
          }`}
        >
          {isApprover ? "Session: Authenticated" : "Auth Required"}
        </span>
      </div>

      {!isApprover ? (
        <form onSubmit={onApproverLogin} className="flex gap-2">
          <input
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder="Approver Passcode"
            className="bg-[#061017] border border-cyan-900/90 text-white text-xs rounded-lg px-3 py-1.5 flex-1 focus:ring-1 focus:ring-cyan-500 outline-none font-mono"
          />
          <button
            type="submit"
            className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-lg transition-colors shadow-sm"
          >
            Unlock
          </button>
        </form>
      ) : (
        <div className="space-y-3 pt-1">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onHumanAction({ action: "approve_held" })}
              disabled={protectedRunStatus !== "paused_held"}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold transition-colors shadow-sm"
            >
              Approve Once
            </button>
            <button
              onClick={() => onHumanAction({ action: "deny_held" })}
              disabled={protectedRunStatus !== "paused_held"}
              className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold transition-colors shadow-sm"
            >
              Deny Action
            </button>
            <button
              onClick={() =>
                onHumanAction({
                  action: "restore_scope",
                  grant: { tool: "read_file", scope: "/hr/" },
                })
              }
              className="px-3.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-colors shadow-sm"
            >
              Restore /hr/ Scope
            </button>
            {isFrozen && (
              <button
                onClick={() => onHumanAction({ action: "unfreeze" })}
                className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-colors shadow-sm"
              >
                Unfreeze
              </button>
            )}
          </div>

          {/* Natural Language Rule Drafter */}
          <div className="pt-3 border-t border-cyan-900/50 space-y-2">
            <div className="text-[10px] font-mono text-cyan-400 uppercase font-semibold">
              Draft Policy Rule (Nemotron Super 120B)
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={ruleText}
                onChange={(e) => setRuleText(e.target.value)}
                placeholder='e.g., "require approval for send_email"'
                className="bg-[#061017] border border-cyan-900/90 text-white text-xs rounded-lg px-3 py-1.5 flex-1 focus:ring-1 focus:ring-cyan-500 outline-none font-mono"
              />
              <button
                onClick={onDraftRule}
                className="px-3.5 py-1.5 bg-cyan-950 hover:bg-cyan-900 text-cyan-200 text-xs font-bold rounded-lg border border-cyan-800"
              >
                Draft Rule
              </button>
            </div>
            {ruleMessage && <p className="text-[11px] text-cyan-300 font-mono">{ruleMessage}</p>}
            {draftedRule && (
              <div className="p-3 rounded-lg bg-[#061017] border border-cyan-900 flex items-center justify-between text-xs font-mono">
                <span className="text-zinc-200 text-[11px]">
                  {JSON.stringify(draftedRule.restriction)}
                </span>
                <button
                  onClick={onActivateRule}
                  className="px-3 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs"
                >
                  Activate via Ratchet
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {loginError && <p className="text-xs text-rose-400 font-mono">{loginError}</p>}
    </div>
  );
}
