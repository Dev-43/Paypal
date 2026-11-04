"use client";

import React, { useState, useEffect } from "react";

interface ApprovalItem {
  id: string;
  runId: string;
  callId: string;
  status: string;
  action: {
    tool: string;
    args: any;
    rationale?: string;
  };
  createdAt: string;
}

export default function ApprovalsPage() {
  const [passcode, setPasscode] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<string | null>(null);

  const fetchApprovals = async () => {
    try {
      const res = await fetch("/api/approvals");
      if (res.ok) {
        const data = await res.json();
        setApprovals(data.approvals || []);
        setIsAuthenticated(true);
      } else if (res.status === 401) {
        setIsAuthenticated(false);
      }
    } catch {
      // not logged in
    }
  };

  useEffect(() => {
    fetchApprovals();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    try {
      const res = await fetch("/api/approver/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      if (res.ok) {
        setIsAuthenticated(true);
        fetchApprovals();
      } else {
        setMessage("Invalid approver passcode.");
      }
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  const handleDecide = async (id: string, decision: "approved" | "rejected") => {
    setDecidingId(id);
    setMessage(null);
    try {
      const res = await fetch(`/api/approvals/${id}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(`Action ${decision.toUpperCase()} successfully. ${data.ledgerCheck ? `Ledger: ${data.ledgerCheck.status}` : ""}`);
        fetchApprovals();
      } else {
        setMessage(`Decision failed: ${data.error?.message || "Unknown error"}`);
      }
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setDecidingId(null);
    }
  };

  return (
    <div className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Header */}
      <div className="border-b border-[#23242c] pb-6 flex items-center justify-between">
        <div>
          <div className="inline-flex items-center space-x-2 text-xs font-mono mb-2">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            <span className="text-amber-400 font-semibold uppercase tracking-wider">Layer 3: Human Gate</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Human Approver Terminal
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Review and authorize held actions that exceeded budget caps (P2) or triggered safety restrictions.
          </p>
        </div>

        <div className="text-right font-mono text-xs text-zinc-500">
          Passcode for Judges: <span className="text-zinc-300 font-bold">pawl-demo-passcode-2026</span>
        </div>
      </div>

      {message && (
        <div className="p-4 rounded-xl bg-[#0c0d14] border border-zinc-700 text-xs font-mono text-zinc-200">
          {message}
        </div>
      )}

      {/* Login Box */}
      {!isAuthenticated ? (
        <div className="max-w-md mx-auto p-6 rounded-xl border border-[#23242c] bg-[#0c0d14] space-y-4">
          <h2 className="text-base font-bold text-white">Approver Authentication</h2>
          <p className="text-xs text-zinc-400">
            Enter the secret approver passcode to unlock authorization actions.
          </p>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              placeholder="Enter approver passcode"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#07070a] border border-[#23242c] text-white font-mono text-xs focus:outline-none focus:border-rose-500"
            />
            <button
              type="submit"
              className="w-full py-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-colors"
            >
              Sign In to Terminal
            </button>
          </form>
        </div>
      ) : (
        /* Approvals Queue */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white flex items-center space-x-2">
              <span>Pending Action Queue</span>
              <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800">
                {approvals.length} pending
              </span>
            </h2>
            <button
              onClick={fetchApprovals}
              className="px-3 py-1.5 rounded-md bg-[#0c0d14] hover:bg-[#1a1c29] border border-[#23242c] text-xs font-mono text-zinc-300 transition-colors"
            >
              ↻ Refresh
            </button>
          </div>

          {approvals.length === 0 ? (
            <div className="p-8 text-center rounded-xl border border-[#23242c] bg-[#0c0d14] text-zinc-500 text-xs font-mono">
              No actions currently waiting in the approval queue. Run Scenario S3 in the Simulator to test an above-cap hold.
            </div>
          ) : (
            <div className="space-y-4">
              {approvals.map((item) => (
                <div
                  key={item.id}
                  className="p-5 rounded-xl border border-[#23242c] bg-[#0c0d14] space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-white">Tool: {item.action.tool}</span>
                    <span className="text-[10px] font-mono text-zinc-500">Run ID: {item.runId}</span>
                  </div>

                  <div className="p-3 rounded-lg bg-[#07070a] border border-[#23242c] font-mono text-xs text-zinc-300 space-y-1">
                    <div>Parameters: {JSON.stringify(item.action.args, null, 2)}</div>
                    {item.action.rationale && (
                      <div className="text-zinc-500 text-[11px]">Rationale: {item.action.rationale}</div>
                    )}
                  </div>

                  <div className="flex items-center justify-end space-x-3 pt-2">
                    <button
                      disabled={decidingId === item.id}
                      onClick={() => handleDecide(item.id, "rejected")}
                      className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs border border-zinc-700 transition-colors"
                    >
                      Reject Action
                    </button>
                    <button
                      disabled={decidingId === item.id}
                      onClick={() => handleDecide(item.id, "approved")}
                      className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors shadow-sm"
                    >
                      Authorize & Execute
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
