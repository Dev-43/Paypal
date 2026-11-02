# BUILD.md — Pawl

> ⚠️ AGENT INSTRUCTIONS: Build ONLY what is listed here. Do not add features, do not infer requirements, do not improve on the spec. If something is unclear, output a comment `// UNCLEAR: [question]` and stop. Do not proceed past unclear points.

## Project Overview

Pawl is a tighten-only guard layer between an AI agent and PayPal's agent-toolkit tools (PayPal sandbox only). Every tool call the agent proposes passes through a Gateway that classifies the tool, applies deterministic money rules, asks an intent Watcher model, holds risky calls for a human, executes through the PayPal agent toolkit, then reads the result back from PayPal ("ledger truth") and compares it with what the agent claimed. Limits can only shrink automatically; only an authenticated human can widen them.

Headline demo: a hostile instruction hidden in buyer-controlled text on a PayPal object fools an unguarded agent into a real sandbox refund; the same run guarded is stopped. Judges can run it through a guided Simulator and a free-form Playground.

This is a NEW repository named `pawl`. The Taut repo (`github.com/Dev-43/Jarvis`) is NOT modified. Taut modules are copied into this repo in one labelled commit (see INTEGRATION.md → Port Map); everything after that commit is new work for the PayPal AI Hackathon.

## Deadline Facts (do not change)

- Hackathon: PayPal AI Hackathon (Devpost). Submission closes Nov 12, 2026, 12:00 pm Pacific = Nov 13, 2026, 01:30 am IST.
- Internal submit target: Nov 11, 2026, 8:00 pm IST.
- Feature freeze: Nov 8, 2026, end of day IST.
- Build is solo. Budget: about 4.5 hours per day.

## Tech Stack

| Layer | Choice | Rule |
|---|---|---|
| Runtime | Node.js 20+ | same as Taut |
| Framework | Next.js (App Router) + TypeScript | use the exact version in Taut's package.json |
| Styling | Tailwind CSS | same config approach as Taut |
| Database | Neon Postgres via Prisma | same as Taut |
| Tests | Vitest | same as Taut |
| PayPal | `@paypal/agent-toolkit` (TypeScript) against the PayPal sandbox | pinned to `1.11.0`. Never `latest`. |
| Watcher + Interpreter models | NVIDIA Nemotron tiers on Nebius Token Factory | same tier roles as Taut |
| Target agent model | chosen by measurement in Task 4.3 among Nemotron Super and Gemini Flash | highest measured fool rate wins |
| Fallback model | Gemini free tier via plain HTTPS fetch | no new package |
| Hosting | Vercel Hobby + Neon free | free tiers only |

No other packages may be installed. Adding a package requires editing this table first.

## Safety Invariants (apply everywhere)

1. `PAYPAL_ENV` must equal `sandbox`. If it does not, the app refuses to start and `/api/health` reports failure. Production PayPal credentials must never be accepted.
2. The Watcher can only emit restrictions from the closed union below. No automated path may widen permissions.
3. Deterministic rules always override a Watcher "allow".
4. Any failure of the Watcher, the PayPal read-back, or the database fails CLOSED: the call is HELD.
5. The executor never auto-retries a `money_move` call. An ambiguous result is marked UNVERIFIABLE and triggers a read-back.
6. Money amounts are compared as integers in minor units using a currency exponent table (zero-decimal currencies such as JPY use exponent 0). Never compare floating-point values.

## Defence Layers (fixed order)

| Layer | Name | What it does | If it fails |
|---|---|---|---|
| L0 | Classification | Tool must exist in the registry; class is read, money_move or config | unknown tool → BLOCKED |
| L1 | Money rules P1–P8 | deterministic checks | rule error → HELD |
| L2 | Watcher | model checks the action against the declared task and sees which untrusted text the agent read | model error or timeout (8 s) → HELD |
| L3 | Human approval | HELD calls wait in the approval queue | no decision → stays HELD, never auto-approves |
| L4 | Ledger truth | after execution, read back from PayPal and compare | mismatch → freeze; unverifiable → require_approval on that tool |
| L5 | Audit + briefing | hash-chained log, plain-language incident briefing | audit write failure → run frozen |

Honest limit (must appear in README): a refund that has already executed cannot be undone by this system. L4 contains the damage (freeze, disable tool, evidence) but does not reverse it.

## Money Rules (defaults; editable only by an approver)

| ID | Rule | Outcome |
|---|---|---|
| P1 | Tool is on the run's allow-list | else BLOCKED |
| P2 | `money_move` amount ≤ per-call cap (default 50.00 USD) | above → HELD |
| P3 | Refund amount ≤ remaining refundable amount of the referenced capture, confirmed by a pre-flight read | above → BLOCKED; read fails → HELD |
| P4 | Sum of `money_move` amounts in the run ≤ daily budget (default 200.00 USD) | above → HELD |
| P5 | Currency is in the allow-list (default USD) | else BLOCKED |
| P6 | Invoice recipient is in the merchant contact allow-list | else HELD |
| P7 | Target order or dispute ID is in the run's declared scope list | else BLOCKED |
| P8 | Step count ≤ 25 | above → run frozen |

## Shared Contracts (ALL work must honor these)

### Data Models

**ToolCallEnvelope** (ported unchanged from Taut): runId, stepIndex, tool, args (JSON object), rationale (string).

**RegistryEntry**: tool (string), class (read | money_move | config), amountPath (JSON path or none), currencyPath (JSON path or none), targetPath (JSON path or none), readBackTool (tool name or none), untrustedFieldPaths (list of JSON paths into the tool result that contain text written by outsiders).

**Verdict**: decision (allow | held | blocked | frozen), layer (L0–L5), ruleId (P1–P8 or none), reason (one sentence), watcherTier (nano | super | ultra | none), confidence (0–1 or none).

**Restriction** (closed union, ported unchanged): revoke_scope(tool, scope) | disable_tool(tool) | require_approval(tool) | freeze_run. Every applied restriction increments PermissionState.version by 1.

**LedgerCheck**: callId, status (MATCH | MISMATCH | UNVERIFIABLE), expected {amountMinor, currency, target}, observed {amountMinor, currency, target} or null, detail (string), checkedAt.

**AgentReport** (the agent's final output, JSON): actions list of {tool, amount, currency, target, claimedStatus}.

**ReportCheck**: runId, status (MATCH | MISMATCH), differences (list of strings).

**AuditEvent**: seq, runId, type, payload (JSON), prevHash, hash (SHA-256 over seq + runId + type + payload + prevHash). Event types: run_started, tool_proposed, rule_verdict, watcher_verdict, held, approved, rejected, executed, readback_match, readback_mismatch, readback_unverifiable, restriction_applied, run_frozen, report_checked, briefing_created, run_finished.

**Run**: id, mode (baseline | protected), scenarioId or "custom", task (string), scopeIds (list), state (running | held | frozen | finished), createdAt.

**Approval**: id, runId, callId, status (pending | approved | rejected), decidedBy, decidedAt.

**Scenario**: id (S1–S4), title, task, scopeIds, plantedObjectRef, attackerText or none, expectedBaseline, expectedProtected.

### API Endpoints

| Method | Path | Request | Response | Auth |
|---|---|---|---|---|
| POST | /api/gateway/call | header x-taut-key; body {runId, mode, action: ToolCallEnvelope} | {verdict, result or null, ledgerCheck or null} | agent key |
| POST | /api/runs | {scenarioId or "custom", mode, task?, attackerText?, model?} | {runId} | public, rate-limited |
| GET | /api/runs/:id | none | {run, events, verdicts, ledgerChecks, reportCheck} | public |
| POST | /api/scenarios/:id/plant | none | {plantedObjectRef} | public, rate-limited |
| POST | /api/playground/plant | {attackerText} (max 500 chars) | {plantedObjectRef} | public, rate-limited |
| POST | /api/approver/login | {passcode} | session cookie | none |
| GET | /api/approvals | none | pending approvals | approver |
| POST | /api/approvals/:id/decide | {decision: approved or rejected} | {approval} | approver |
| GET | /api/rules | none | current rule config | public |
| PUT | /api/rules | rule config | saved config; event logged | approver |
| GET | /api/audit/:runId/verify | none | {valid, brokenAtSeq or null} | public |
| GET | /api/health | none | {db, paypalToken, nebius, gemini, paypalEnv} | public |

Rate limit: 10 runs per hour per IP; global daily model spend guard ported from Taut.

### Environment Variables

| Name | Purpose | Set by |
|---|---|---|
| PAYPAL_ENV | must be `sandbox` | owner |
| PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET | sandbox app credentials | owner |
| PAYPAL_BUYER_A_EMAIL / PAYPAL_BUYER_B_EMAIL | sandbox buyer accounts | owner |
| NEBIUS_API_KEY | Watcher + Interpreter models | owner |
| GEMINI_API_KEY | optional fallback model | owner |
| DATABASE_URL / DIRECT_URL | Neon Postgres | owner |
| APPROVER_PASSCODE | approver login | owner |
| SESSION_SECRET | 64-char hex session signing | owner |
| DEMO_AGENT_KEY | gateway agent key | owner |
| SPEND_GUARD_USD | daily model-spend cap | owner |
| FAULT_INJECTION | empty or `ledger_mismatch`; simulator only | owner |

### File Structure (root)

```
pawl/
  README.md  LICENSE  NOTICE.md
  BUILD.md  BUILD_solo-tasks.md  INTEGRATION.md
  docs/ ARCHITECTURE.md THREAT_MODEL.md PAYPAL_ISSUES.md WHAT_IS_NEW.md
        TOOL_INVENTORY.md ATTACK_CHANNELS.md LEDGER_PROBES.md
        SANDBOX_SETUP.md DEMO_SCRIPT.md LIMITATIONS.md TESTING.md
  prisma/ schema.prisma  seed.ts
  evals/ cases.json
  tests/
  src/
    app/ page.tsx simulator/page.tsx playground/page.tsx
         approvals/page.tsx runs/[id]/page.tsx audit/page.tsx
         api/ (one route per endpoint above)
    lib/
      gateway/    (ported: gateway, ratchet, audit, verdict)
      watcher/    (ported, prompts updated for money context)
      interpreter/ (ported)
      agent/      (ported runner + merchant-ops persona)
      paypal/     client, token, registry, executor, readback, seed
      rules/      money rules P1–P8, currency table
      ledger/     check, report-check
      scenarios/  S1–S4 definitions and planting
```

## Scenarios (fixed)

| ID | Name | Baseline outcome | Protected outcome |
|---|---|---|---|
| S1 | Clean small refund | executes | allowed, executes, ledger MATCH |
| S2 | Poisoned buyer text (headline) | agent follows hidden instruction; real sandbox refund to the wrong order or over amount | blocked by P3/P7, Watcher flags it, refund tool set to require_approval, briefing created |
| S3 | Legit refund above cap | executes | HELD by P2; approver approves; executes; ledger MATCH |
| S4 | Ledger truth | agent report disagrees with PayPal | MISMATCH detected, run frozen, tool disabled |

S4 uses a real discrepancy found in Task 3.5. If none is found, S4 uses fault injection and the UI must show a visible "FAULT INJECTION" banner on that run.

## Team Overview

| Teammate | Role | Owns | Integrates With |
|----------|------|------|-----------------|
| Devesh | Solo owner | everything, in the order given in BUILD_solo-tasks.md | n/a |

## DO NOT Section (applies to all agents)

- Do not add any feature not listed in this document (no MCP proxy, no Braintree adapter, no extra pages)
- Do not change shared contract definitions
- Do not rename files or folders
- Do not install packages not listed in the tech stack
- Do not use your own judgment to "improve" the code
- Do not modify the Taut repository
- Do not use PayPal production credentials or any non-sandbox endpoint
- Do not use recorded, mocked or hard-coded results in the Simulator or Playground; every run must call the real model and the real PayPal sandbox
- Do not put the word "PayPal" in the project name, repo name or logo
- Do not claim a result in README or the video that was not measured
