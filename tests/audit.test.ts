import { describe, it, expect } from "vitest";
import {
  canonicalJson,
  computeEventHash,
  GENESIS_PREV_HASH,
} from "../src/lib/audit/chain";

describe("Audit Hash-Chain (T7)", () => {
  it("canonicalJson produces deterministic sorted string regardless of key order", () => {
    const objA = { z: 10, a: "hello", m: { b: 2, a: 1 } };
    const objB = { a: "hello", m: { a: 1, b: 2 }, z: 10 };

    expect(canonicalJson(objA)).toBe(canonicalJson(objB));
    expect(canonicalJson(objA)).toBe('{"a":"hello","m":{"a":1,"b":2},"z":10}');
  });

  it("GENESIS_PREV_HASH is exactly 64 zeros", () => {
    expect(GENESIS_PREV_HASH.length).toBe(64);
    expect(GENESIS_PREV_HASH).toBe("0".repeat(64));
  });

  it("computes reproducible SHA-256 hashes for sequential events", () => {
    const prevHash = GENESIS_PREV_HASH;
    const seq = 0;
    const type = "run_started";
    const at = "2026-10-25T11:00:00.000Z";
    const payload = { scenario: "S2", mode: "protected" };

    const hash1 = computeEventHash(prevHash, seq, type, at, payload);
    const hash2 = computeEventHash(prevHash, seq, type, at, payload);
    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64);

    // Any payload change alters the hash
    const tamperedPayload = { scenario: "S2", mode: "baseline" };
    const tamperedHash = computeEventHash(prevHash, seq, type, at, tamperedPayload);
    expect(tamperedHash).not.toBe(hash1);
  });

  it("detects broken chain when intermediate event hash or payload is modified", () => {
    const at0 = "2026-10-25T11:00:00.000Z";
    const at1 = "2026-10-25T11:00:01.000Z";
    const at2 = "2026-10-25T11:00:02.000Z";

    const hash0 = computeEventHash(GENESIS_PREV_HASH, 0, "run_started", at0, { run: 1 });
    const hash1 = computeEventHash(hash0, 1, "agent_step", at1, { step: 1 });
    const hash2 = computeEventHash(hash1, 2, "action_executed", at2, { tool: "read_file" });

    const chain = [
      { seq: 0, prevHash: GENESIS_PREV_HASH, hash: hash0, at: at0, type: "run_started", payload: { run: 1 } },
      { seq: 1, prevHash: hash0, hash: hash1, at: at1, type: "agent_step", payload: { step: 1 } },
      { seq: 2, prevHash: hash1, hash: hash2, at: at2, type: "action_executed", payload: { tool: "read_file" } },
    ];

    // Verification helper simulating verifyChain logic on in-memory array
    const verifyInMemory = (events: typeof chain) => {
      for (let i = 0; i < events.length; i++) {
        const cur = events[i];
        if (cur.seq !== i) return { ok: false, brokenAtSeq: cur.seq };
        const expectedPrev = i === 0 ? GENESIS_PREV_HASH : events[i - 1].hash;
        if (cur.prevHash !== expectedPrev) return { ok: false, brokenAtSeq: cur.seq };
        const expectedHash = computeEventHash(cur.prevHash, cur.seq, cur.type, cur.at, cur.payload);
        if (expectedHash !== cur.hash) return { ok: false, brokenAtSeq: cur.seq };
      }
      return { ok: true, brokenAtSeq: null };
    };

    expect(verifyInMemory(chain).ok).toBe(true);

    // Tamper with event 1's payload without updating hash
    const tamperedChain = JSON.parse(JSON.stringify(chain));
    tamperedChain[1].payload = { step: 99 };
    const result = verifyInMemory(tamperedChain);
    expect(result.ok).toBe(false);
    expect(result.brokenAtSeq).toBe(1);

    // Tamper with event 2's prevHash
    const tamperedPrevChain = JSON.parse(JSON.stringify(chain));
    tamperedPrevChain[2].prevHash = "f".repeat(64);
    const resultPrev = verifyInMemory(tamperedPrevChain);
    expect(resultPrev.ok).toBe(false);
    expect(resultPrev.brokenAtSeq).toBe(2);
  });
});
