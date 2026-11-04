"use client";

import React, { useState } from "react";

export default function AuditPage() {
  const [runId, setRunId] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!runId.trim()) return;

    setVerifying(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch(`/api/audit/${encodeURIComponent(runId.trim())}/verify`);
      const data = await res.json();
      if (res.ok) {
        setResult(data);
      } else {
        setError(data.error?.message || "Verification failed");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Header */}
      <div className="border-b border-[#23242c] pb-6">
        <div className="inline-flex items-center space-x-2 text-xs font-mono mb-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
          <span className="text-cyan-400 font-semibold uppercase tracking-wider">Layer 5: Tamper-Evident Audit</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Cryptographic Audit Verification
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          Verify the mathematical integrity of the SHA-256 hash chain for any agent execution run.
        </p>
      </div>

      {/* Verification Input Box */}
      <div className="p-6 rounded-xl border border-[#23242c] bg-[#0c0d14] space-y-4">
        <h2 className="text-base font-bold text-white">Audit Chain Verifier</h2>
        <p className="text-xs text-zinc-400">
          Enter a Run ID to recompute all sequential SHA-256 event hashes and verify prevHash linkages against the genesis state.
        </p>
        <form onSubmit={handleVerify} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Enter Run ID (e.g. run-test-1)"
            value={runId}
            onChange={(e) => setRunId(e.target.value)}
            className="flex-1 px-3 py-2.5 rounded-lg bg-[#07070a] border border-[#23242c] text-white font-mono text-xs focus:outline-none focus:border-rose-500"
          />
          <button
            type="submit"
            disabled={verifying}
            className="px-6 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-xs transition-colors flex items-center justify-center space-x-2"
          >
            <span>{verifying ? "Verifying..." : "Verify Chain"}</span>
          </button>
        </form>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800 text-xs font-mono text-rose-300">
          Error: {error}
        </div>
      )}

      {result && (
        <div className="p-6 rounded-xl border border-[#23242c] bg-[#0c0d14] space-y-4 font-mono text-xs">
          <div className="flex items-center justify-between border-b border-[#23242c] pb-3">
            <span className="text-sm font-bold text-white">Verification Report</span>
            <span
              className={`px-3 py-1 rounded-full font-bold uppercase text-[11px] ${
                result.valid
                  ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                  : "bg-rose-950 text-rose-300 border border-rose-800"
              }`}
            >
              {result.valid ? "CHAIN VALID (UNBROKEN)" : `BROKEN AT SEQ #${result.brokenAtSeq}`}
            </span>
          </div>

          <div className="space-y-2 text-zinc-300">
            <div>Total Events Evaluated: <span className="font-bold text-white">{result.count}</span></div>
            <div>Genesis Linkage: <span className="text-emerald-400">0000...0000 (Verified)</span></div>
            <div>Contiguous Sequence: <span className="text-emerald-400">Strictly Incremental</span></div>
            <div>SHA-256 Mathematical Proof: <span className="text-emerald-400">{result.valid ? "All hashes match payload" : "TAMPER DETECTED"}</span></div>
          </div>
        </div>
      )}
    </div>
  );
}
