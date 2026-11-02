"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";

const EvalBenchmarkScorecard = dynamic(
  () => import("../../components/EvalBenchmarkScorecard"),
  {
    ssr: false,
    loading: () => (
      <div className="py-8 text-center text-xs text-zinc-500 font-mono animate-pulse">
        Loading evaluation scorecard...
      </div>
    ),
  }
);

const AuditVerificationTerminal = dynamic(
  () => import("../../components/AuditVerificationTerminal"),
  {
    ssr: false,
    loading: () => (
      <div className="py-8 text-center text-xs text-zinc-500 font-mono animate-pulse">
        Loading audit verification terminal...
      </div>
    ),
  }
);

export default function MetricsPage() {
  const [metrics, setMetrics] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [auditResults, setAuditResults] = useState<Record<string, any>>({});
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  useEffect(() => {
    fetchMetrics();
  }, []);

  async function fetchMetrics() {
    setLoading(true);
    try {
      const res = await fetch("/api/metrics");
      const data = await res.json();
      setMetrics(data);
    } catch (e) {
      console.error("Failed to fetch metrics:", e);
    } finally {
      setLoading(false);
    }
  }

  async function handleAuditVerify(runId: string) {
    setVerifyingId(runId);
    try {
      const res = await fetch(`/api/audit/verify?runId=${runId}`);
      const data = await res.json();
      setAuditResults((prev) => ({
        ...prev,
        [runId]: data,
      }));
    } catch {
      setAuditResults((prev) => ({
        ...prev,
        [runId]: { ok: false, message: "Verification check failed" },
      }));
    } finally {
      setVerifyingId(null);
    }
  }

  const spendCap = 35.0;
  const currentSpend = metrics?.summary?.totalCostUsd || 0;
  const spendPct = Math.min(100, (currentSpend / spendCap) * 100);

  return (
    <div className="flex-1 max-w-7xl w-full mx-auto px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      {/* Header */}
      <div className="p-6 rounded-2xl bg-[#0e0f14] border border-[#222533] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Telemetry & Evaluation Benchmarks
            </h1>
            <span className="text-[11px] font-mono px-2.5 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-800/80 font-bold uppercase">
              Token Factory Live
            </span>
          </div>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Real-time inference costs, Nemotron hardware latencies, 20-case policy benchmarks, and SHA-256 chain verification.
          </p>
        </div>
        <div className="flex items-center space-x-2.5">
          <button
            onClick={fetchMetrics}
            className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-semibold border border-zinc-800 transition-colors"
          >
            Refresh Telemetry
          </button>
          <Link
            href="/compare"
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors shadow-sm"
          >
            Live Compare
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-zinc-500 font-mono text-xs">
          Loading metrics from SpendLedger and Audit Chain...
        </div>
      ) : (
        <>
          {/* Top 4 Color-Coded KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Card 1: Spend Cap */}
            <div className="p-4 rounded-xl bg-[#18090f] border border-rose-900/80 space-y-2.5">
              <div className="text-[10px] text-rose-300 font-mono uppercase font-bold flex justify-between">
                <span>Model Spend Cap Guard</span>
                <span className="text-rose-400 font-bold">${currentSpend.toFixed(4)} / ${spendCap}</span>
              </div>
              <div className="text-2xl font-bold text-white font-mono">
                ${currentSpend.toFixed(4)}
              </div>
              <div className="w-full bg-[#0a0406] rounded-full h-1.5 overflow-hidden border border-rose-950">
                <div
                  className="bg-rose-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${Math.max(3, spendPct)}%` }}
                ></div>
              </div>
              <p className="text-[11px] text-zinc-400">
                Hard Limit H2 stops invocations if spend exceeds $35.00.
              </p>
            </div>

            {/* Card 2: Ratchet Tightenings */}
            <div className="p-4 rounded-xl bg-[#181208] border border-amber-900/80 space-y-2">
              <div className="text-[10px] text-amber-400 font-mono uppercase font-bold">
                Ratchet Tightenings
              </div>
              <div className="text-2xl font-bold text-amber-300 font-mono">
                {metrics?.summary?.tightenCount || 0}
              </div>
              <p className="text-[11px] text-zinc-400">
                Unauthorized scopes revoked or dangerous tools disabled.
              </p>
            </div>

            {/* Card 3: Actions Held */}
            <div className="p-4 rounded-xl bg-[#08151f] border border-cyan-900/80 space-y-2">
              <div className="text-[10px] text-cyan-400 font-mono uppercase font-bold">
                Actions Held for Approval
              </div>
              <div className="text-2xl font-bold text-cyan-300 font-mono">
                {metrics?.summary?.holdsCount || 0}
              </div>
              <p className="text-[11px] text-zinc-400">
                Gated for human authorization via Hard Limits H3–H5.
              </p>
            </div>

            {/* Card 4: Runs Frozen */}
            <div className="p-4 rounded-xl bg-[#1a0810] border border-rose-900/80 space-y-2">
              <div className="text-[10px] text-rose-400 font-mono uppercase font-bold">
                Runs Frozen
              </div>
              <div className="text-2xl font-bold text-rose-400 font-mono">
                {metrics?.summary?.freezeCount || 0}
              </div>
              <p className="text-[11px] text-zinc-400">
                Critical breaches permanently halted by fail-closed ratchet.
              </p>
            </div>
          </div>

          {/* Model Latencies Card */}
          <div className="p-5 rounded-2xl bg-[#0b0e14] border border-[#1e2538] space-y-4">
            <div>
              <h2 className="text-sm font-bold text-white">
                NVIDIA Nemotron Tier Latency & Volume
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Runtime inference performance on Nebius Token Factory.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              {["nano", "super", "ultra", "agent"].map((tier) => {
                const stat = metrics?.tierStats?.[tier] || { calls: 0, p50: 0, p95: 0 };
                const titles: Record<string, { name: string; role: string; border: string; badge: string }> = {
                  nano: { name: "Nemotron Nano 30B", role: "Watcher Tier 1", border: "border-cyan-800/80 bg-[#08151f]", badge: "text-cyan-300 bg-cyan-950 border-cyan-700 font-bold" },
                  super: { name: "Nemotron Super 120B", role: "Watcher Tier 2", border: "border-purple-800/80 bg-[#140b22]", badge: "text-purple-300 bg-purple-950 border-purple-700 font-bold" },
                  ultra: { name: "Nemotron Ultra 550B", role: "Watcher Tier 3", border: "border-rose-800/80 bg-[#1a0812]", badge: "text-rose-300 bg-rose-950 border-rose-700 font-bold" },
                  agent: { name: "Nemotron Super 120B", role: "Target Agent", border: "border-blue-800/80 bg-[#081220]", badge: "text-blue-300 bg-blue-950 border-blue-700 font-bold" },
                };
                const meta = titles[tier] || { name: tier, role: "Model", border: "border-zinc-800 bg-[#08090c]", badge: "text-zinc-400 bg-zinc-900 border-zinc-800" };

                return (
                  <div key={tier} className={`p-4 rounded-xl border ${meta.border} space-y-2`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-100">{meta.name}</span>
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${meta.badge}`}>{meta.role}</span>
                    </div>
                    <div className="text-xl font-bold text-white font-mono">
                      {stat.calls} <span className="text-xs text-zinc-400 font-normal">calls</span>
                    </div>
                    <div className="text-[11px] text-zinc-400 space-y-0.5 pt-1.5 border-t border-zinc-800/80 font-mono">
                      <div className="flex justify-between">
                        <span className="text-zinc-500">p50 Latency:</span>
                        <span className="text-zinc-200 font-semibold">{stat.p50} ms</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-500">p95 Latency:</span>
                        <span className="text-zinc-200 font-semibold">{stat.p95} ms</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 20-Case Policy Eval Suite Results (Lazy Loaded) */}
          <div className="p-5 rounded-2xl bg-[#0b0e14] border border-[#1e2538] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-white">
                  20-Case Policy Benchmark Evaluation Suite
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  10 in-scope actions, 10 off-task/injection adversarial actions evaluated against live models.
                </p>
              </div>
              {metrics?.latestEval && (
                <span className="text-xs font-mono text-zinc-400 bg-[#08090c] px-3 py-1 rounded-lg border border-zinc-800">
                  Last benchmarked: {new Date(metrics.latestEval.createdAt).toLocaleString()}
                </span>
              )}
            </div>

            <EvalBenchmarkScorecard latestEval={metrics?.latestEval} />
          </div>

          {/* Cryptographic Audit Verification Terminal (Lazy Loaded) */}
          <div className="p-5 rounded-2xl bg-[#0e0f14] border border-[#222533] space-y-4">
            <div>
              <h2 className="text-sm font-bold text-white">
                Cryptographic Audit Chain Verification
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Verify append-only SHA-256 hash chains. Confirms genesis hash, continuous sequential linking, and zero tampering.
              </p>
            </div>

            <AuditVerificationTerminal
              recentRuns={metrics?.recentRuns}
              auditResults={auditResults}
              verifyingId={verifyingId}
              onVerifyRun={handleAuditVerify}
            />
          </div>
        </>
      )}
    </div>
  );
}
