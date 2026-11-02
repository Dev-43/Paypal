# INTEGRATION.md — Merge Rules & Interface Contracts

> This document defines how the pieces come together. Read this before merging any branch. Solo build: "teammates" below means workstreams.

## Integration Order

1. **W0 Port** — first commit, ported Taut modules, tests green. Reason: everything else builds on the gateway, ratchet and audit.
2. **W1 PayPal layer** — sandbox, toolkit, token, registry, executor, seed. Reason: the whole project depends on real sandbox calls working (your decision: sandbox and toolkit first).
3. **W2 Money rules** — plug into the gateway after the registry exists.
4. **W3 Ledger truth** — needs executor and registry read-back entries.
5. **W4 Agent and attacks** — needs W1–W3 so the baseline and protected runs differ.
6. **W5 Interface and deploy** — needs a working run API.
7. **W6 Delivery** — needs a deployed app and measured numbers.

## Port Map (Taut → Pawl)

Source repository path: `D:\Nvidia`

| Capability | Taut source path | Pawl path | Change allowed after port |
|---|---|---|---|
| Gateway core (intercept, verdict assembly) | `D:\Nvidia\src\lib\gateway\index.ts` | `src/lib/gateway/` | replace mock tool execution with `lib/paypal/executor` |
| Hard limits H1–H6 | `D:\Nvidia\src\lib\policy\hardLimits.ts` | replaced by `src/lib/rules/` | rules P1–P8 replace H1–H6 |
| One-way ratchet, PermissionState | `D:\Nvidia\src\lib\policy\ratchet.ts` | `src/lib/gateway/` | none |
| Hash-chained audit | `D:\Nvidia\src\lib\audit\chain.ts` | `src/lib/gateway/` | add the new event types |
| Watcher tier router and prompts | `D:\Nvidia\src\lib\watcher\` | `src/lib/watcher/` | prompt updated in Task 4.5 |
| Interpreter (briefings) | `D:\Nvidia\src\lib\interpreter\` | `src/lib/interpreter/` | briefing text for money incidents |
| Approver auth (HMAC session) | `D:\Nvidia\src\lib\auth\approver.ts`, `D:\Nvidia\src\app\api\approver\` | `src/lib/auth/`, `src/app/api/approver/` | none |
| Agent runner | `D:\Nvidia\src\lib\agent\` | `src/lib/agent/` | persona replaced in Task 4.1 |
| Spend guard | `D:\Nvidia\src\lib\guards\spend.ts` | `src/lib/gateway/` | env var name SPEND_GUARD_USD |
| Compare page UI | `D:\Nvidia\src\app\compare\page.tsx` | `src/app/simulator/` | rebuilt in Task 5.1 |
| Tests and eval runner | `D:\Nvidia\tests\`, `D:\Nvidia\evals\` | `tests/`, `evals/` | cases replaced in Task 4.4 |

Not ported: the mock company database, the mock files and the mock outbox.

## Interface Contracts (handoffs between workstreams)

| From | To | Input | Output |
|---|---|---|---|
| Agent runner (W4) | Gateway (W0) | ToolCallEnvelope | Verdict + result |
| Gateway | Rules (W2) | envelope + RegistryEntry + run state | allow / held / blocked with ruleId |
| Gateway | Watcher (W0/W4) | task, scope, action, rationale, recent steps, untrusted text read | Restriction list or none |
| Gateway | Executor (W1) | approved envelope | toolkit result or error |
| Executor | Ledger check (W3) | executed call + readBackTool | LedgerCheck |
| Ledger check | Ratchet | MISMATCH or UNVERIFIABLE | freeze_run + disable_tool, or require_approval |
| Run API (W5) | Gateway | `/api/gateway/call` | verdict stream into the run page |
| Seed (W1) | Scenarios (W4) | PayPal object IDs | plantedObjectRef per scenario |

## Merge Rules

- Branch naming: `w0-port`, `w1-paypal`, `w2-rules`, `w3-ledger`, `w4-agent`, `w5-ui`, `w6-delivery`.
- Merge: owner merges each branch into `main` only after that workstream's acceptance criteria pass and `npm run test` is green.
- Commit prefix: `W1:`, `W2:` and so on, so the history shows what is new.
- No force pushes to `main`. Tag `freeze-nov8` at the feature freeze.
- Before merging each branch: tests pass; health endpoint is green; `PAYPAL_ENV` check still refuses non-sandbox.

## What Each Workstream Must NOT Touch

| File/Module | Owner | Others must not modify |
|---|---|---|
| `src/lib/gateway/ratchet*` | W0 | Restriction union and monotonic version rule are frozen after Task 0.1 |
| `src/lib/gateway/audit*` | W0 | hash formula frozen; only new event types may be added |
| `src/lib/paypal/registry.ts` | W1 | rules and ledger read entries from it; never edit entries for convenience |
| `src/lib/rules/*` | W2 | gateway may call rules; must not inline rule logic |
| `src/lib/ledger/*` | W3 | gateway may call; must not inline comparison logic |
| `docs/TESTING.md` | W4 | only measured numbers go here |

## Demo Path (target video length 2:45; hard limit under 3:00)

| Time | What the viewer sees | Code that runs |
|---|---|---|
| 0:00–0:20 | One-line hook: agents now hold payment tools and a recent exchange breach showed that one trusted path doing both authorize and approve is dangerous (say root cause is not yet published) | landing page |
| 0:20–0:50 | S2 baseline: hidden instruction in buyer text, agent obeys, real sandbox refund appears in PayPal's sandbox view | Simulator, `/api/runs` baseline, executor, read tool panel |
| 0:50–1:30 | S2 protected: P3/P7 block, Watcher flags untrusted text, refund tool set to require approval, briefing card | rules, watcher, ratchet, interpreter |
| 1:30–1:55 | S3: legit refund above cap is held, approver approves, executes, ledger MATCH | approvals page, executor, ledger check |
| 1:55–2:25 | S4: ledger truth flags a mismatch, run frozen (banner if fault injection) | ledger check, ratchet |
| 2:25–2:45 | Playground: type new attacker text, run, blocked; show audit "Verify chain" | playground, audit verify |
| 2:45–2:55 | Close: tighten-only limits, measured fool rate and eval numbers, URL | README numbers |

Every step runs the real model and the real PayPal sandbox. Nothing is pre-recorded inside the app.

## Fallback Matrix

| Failure | Detect | Fallback |
|---|---|---|
| Sandbox token expires | health shows lifetime; 401 on call | auto refresh, one retry; restart token service |
| Toolkit base URL or version problem (known open issues #43, #99) | calls fail at first request | step back to the previous pinned version; never use `latest` |
| Toolkit amount mismatch (known open issue #110) | Task 3.5 probes | use it as the real S4 discrepancy if reproducible |
| No idempotency on create/capture (known open issues #98, #108) | review | executor never retries money calls; ambiguous result is UNVERIFIABLE |
| Attacker text channel not writable | Task 4.2 | next channel in order: order fields, invoice memo, manual dispute message |
| Target model not fooled | Task 4.3 below 3 of 10 | try the other model; then reword attacker text (maximum 3 variants, list all in `docs/TESTING.md`) |
| Nebius unavailable or credits out | health | Gemini fallback for Watcher; rerun evals; note it in README |
| Payment slips through the layers | ledger MISMATCH after execution | freeze, disable tool, evidence record, briefing; README states the system cannot reverse a completed refund |
| PayPal sandbox outage | health red | retry later; record the video in a stable window; keep two good takes; no fake data |
| Neon outage | health red | fail closed (calls HELD); README local run steps are the judge fallback |
| Vercel limit or outage | hosted URL down | README local run steps; keep the hosted demo alive until Dec 15, 2026 8:00 am Pacific |
| Judge abuse of Playground | rate limit hit | 10 runs per hour per IP, 500-character cap, daily spend guard |

## Known Integration Risks

| Risk | Mitigation |
|---|---|
| Taut paths unknown for the port | owner fills Port Map before Task 0.1 |
| Toolkit tool names differ from assumptions | Task 1.2 inventory before any registry entry |
| Dispute messages may not be readable or writable by API | Task 4.2 picks the channel; order fields are the default |
| Watcher latency during demo | Nano screens first; 8 second timeout then HELD |
| Hosted demo needs PayPal sandbox credentials | credentials stay server-side; judges need no account |
| Judges may weigh reuse | WHAT_IS_NEW.md lists new work per commit prefix; README states the port honestly |
| "PayPal" used in a project name or logo | project name is Pawl; logos avoided |
| Other agent payment guardrail projects already exist (budget caps, semantic checks, human approval) | README must not claim "first" or "only"; it states the measured differences: PayPal ledger-truth read-back, tighten-only ratchet, buyer-controlled-text attack on PayPal objects |
| Name collision for "Pawl" | before Task 0.1, search GitHub, npm and Devpost for "Pawl"; if a payments or AI-agent project uses it, pick another name and replace it in all files |

## Submission Checklist (Devpost rules)

- [ ] Project built or significantly updated during Oct 1 – Nov 12, 2026, with the update explained in the text description
- [ ] Meaningful PayPal developer platform use (sandbox) and meaningful AI use
- [ ] Text description of features and functionality
- [ ] Functional demo: hosted URL and also complete setup and run steps in README (not a mockup)
- [ ] Public repository on GitHub with all source, assets and instructions
- [ ] License file visible in the repository About section (MIT)
- [ ] AI tools and models listed, with how each is used
- [ ] Demo video under 3 minutes, public on YouTube, link in the form
- [ ] Video shows the project running; no third-party trademarks or copyrighted music beyond what is unavoidable in sandbox screens
- [ ] All materials in English
- [ ] Project stays available free of charge for judges until the Judging Period ends (Dec 15, 2026, 8:00 am Pacific)
- [ ] Credentials or passcodes judges need are written in README
- [ ] Submitted (not draft) by Nov 11, 2026, 8:00 pm IST

## After Submission (not before)

- Small pull request to a PayPal repository, for example tool annotations (read versus money-moving) from open issue #114 of the agent-toolkit repo. Before writing it: read the repo's contributing guidelines, check for a contributor agreement, search open pull requests for duplicates.
