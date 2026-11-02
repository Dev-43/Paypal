# BUILD_solo-tasks.md — Devesh (solo owner)

> ⚠️ AGENT INSTRUCTIONS: You are building ONLY the items in this file. Nothing else. Build exactly as specified. Work tasks in the order listed. Do not start a task before the previous task's acceptance criteria pass.

## Your Scope

Everything in the `pawl` repo. Six workstreams: W0 port, W1 PayPal layer, W2 money rules, W3 ledger truth, W4 agent and attacks, W5 interface and deploy, W6 delivery.

## Day Plan (about 4.5 hours per day, IST)

| Day | Date | Tasks |
|---|---|---|
| D1 | Nov 1 | 0.1, 0.2, 1.1 |
| D2 | Nov 2 | 1.2, 1.3, 1.4 |
| D3 | Nov 3 | 1.5, 1.6, 2.1 |
| D4 | Nov 4 | 2.2, 2.3, 2.4, 3.1 |
| D5 | Nov 5 | 3.2, 3.3, 3.4, 3.5 |
| D6 | Nov 6 | 4.1, 4.2, 4.3 |
| D7 | Nov 7 | 4.4, 4.5, 5.1 |
| D8 | Nov 8 | 5.2, 5.3, 5.4, deploy. FEATURE FREEZE at end of day |
| D9 | Nov 9 | bug fixes only, 6.1 start, rehearse demo |
| D10 | Nov 10 | 6.1, 6.2, record video |
| D11 | Nov 11 | 6.3, 6.4, submit by 8:00 pm IST |

If a day's tasks slip, cut in this order: Task 5.3 (Playground rule editor), Task 4.4 (eval size down to 12 cases), Task 3.3 (report check). Never cut Tasks 1.1–1.5, 2.1–2.4, 3.1–3.2, 4.1–4.3, 6.1–6.4.

## Your Files

See the root file tree in BUILD.md. Files per task are listed below.

## Your Tasks (ordered by priority)

### Task 0.1: Create repo and port Taut modules
- What to build: new public repo `pawl` with MIT LICENSE. One first commit titled `Port Taut core modules (pre-existing work)` containing only the modules listed in INTEGRATION.md → Port Map. Then run the ported tests.
- File(s): repo root, `NOTICE.md` (one paragraph: parts derive from the author's earlier project Taut, MIT).
- Inputs: Taut repo source.
- Outputs: green ported unit tests.
- Acceptance criteria: `npm run test` passes for all ported tests; git log shows the port commit first; LICENSE is detected by GitHub in the repo About section.

### Task 0.2: Remove Nebius-hackathon branding
- What to build: remove hackathon badges and event-specific text copied from Taut. Keep model names.
- File(s): `README.md`, any page text.
- Acceptance criteria: search for "Nebius_x_NVIDIA" and "hackathon" in the repo returns only intentional mentions of the PayPal AI Hackathon.

### Task 1.1: Sandbox accounts and a first real call
- What to build: create one sandbox business account, two sandbox personal (buyer) accounts, one sandbox app. Write steps (no secrets) in `docs/SANDBOX_SETUP.md`. Put credentials in `.env.local` only.
- Inputs: PayPal Developer Dashboard.
- Outputs: working credentials.
- Acceptance criteria: using the toolkit, create one order and capture it; the capture ID is visible in the sandbox dashboard; the steps are written down so a stranger can repeat them.

### Task 1.2: Install and inventory the toolkit
- What to build: install `@paypal/agent-toolkit` at an exact pinned version; list every tool it exposes and each tool's argument names. Write `docs/TOOL_INVENTORY.md` with columns: tool, arguments, class (read | money_move | config), suspected untrusted text fields.
- Acceptance criteria: the file lists every tool the toolkit exposes in your configuration; no tool name appears that you did not see in the toolkit; package.json has no `latest` or `^` for this package.
- Fallback: if the toolkit cannot run in-process, write `// UNCLEAR: toolkit cannot run in-process` and stop; the stretch plan (MCP) is not authorized without editing BUILD.md.

### Task 1.3: Token service
- What to build: sandbox token handling with refresh at 60% of lifetime and exactly one retry after a 401. Health endpoint reports remaining token lifetime.
- File(s): `src/lib/paypal/token.ts`, `src/app/api/health/route.ts`.
- Acceptance criteria: with a deliberately invalidated token the next call recovers on its own; a test proves one retry only; app refuses to start if PAYPAL_ENV is not `sandbox`.

### Task 1.4: Registry
- What to build: registry entries for every tool you allow the agent to use. Allow-list is read tools for orders and disputes plus the money_move tools needed for refund, capture and invoice. Everything else is absent from the registry.
- File(s): `src/lib/paypal/registry.ts`.
- Acceptance criteria: a proposed tool not in the registry returns BLOCKED at L0; each money_move entry has amountPath, currencyPath, targetPath and a readBackTool.

### Task 1.5: Executor
- What to build: gateway-to-toolkit executor with a 15-second timeout. Read tools may retry once on network error. money_move tools never retry; an ambiguous result becomes an UNVERIFIABLE ledger check.
- File(s): `src/lib/paypal/executor.ts`.
- Acceptance criteria: a test simulating a timeout on a refund shows zero retries and status UNVERIFIABLE.

### Task 1.6: Seed script
- What to build: idempotent seed creating sandbox orders with captures for S1–S4, storing object IDs in the database.
- File(s): `prisma/seed.ts`, `src/lib/paypal/seed.ts`.
- Acceptance criteria: running seed twice leaves the same logical state; each scenario has a stored plantedObjectRef.

### Task 2.1: Money rules P2, P4, P5
- What to build: per-call cap, daily budget, currency allow-list using integer minor units and a currency exponent table.
- File(s): `src/lib/rules/money-rules.ts`, `src/lib/rules/currency.ts`.
- Acceptance criteria: at least 3 unit tests per rule (allow, exact boundary, block); a JPY case proves exponent 0 handling.

### Task 2.2: Money rules P3, P6, P7
- What to build: refund-versus-remaining-capture check using a pre-flight read; invoice recipient allow-list; declared scope list check.
- File(s): `src/lib/rules/money-rules.ts`, `src/lib/rules/scope.ts`.
- Acceptance criteria: at least 3 unit tests per rule; a failed pre-flight read yields HELD, not allow.

### Task 2.3: Step budget P8 and precedence
- What to build: step budget freeze at 25; precedence so a Watcher allow can never override HELD or BLOCKED.
- Acceptance criteria: a test with Watcher allow and rule BLOCKED returns BLOCKED.

### Task 2.4: Rule config storage and approver edits
- What to build: rule config stored in the database; `GET /api/rules` public; `PUT /api/rules` approver only; each edit written to the audit log.
- Acceptance criteria: an unauthenticated PUT returns 401; an edit appears in the audit chain.

### Task 3.1: Ledger check for money_move calls
- What to build: after every executed money_move call, call its readBackTool and compare amountMinor, currency and target exactly (no tolerance).
- File(s): `src/lib/ledger/check.ts`.
- Acceptance criteria: MATCH, MISMATCH and UNVERIFIABLE each have a test; MISMATCH applies `freeze_run` and `disable_tool` for that tool.

### Task 3.2: Mismatch handling and incident
- What to build: on MISMATCH, ratchet restriction plus Interpreter briefing (120 words maximum) plus an evidence record (expected, observed, call, run).
- Acceptance criteria: restriction version increments by exactly 1; briefing appears in the run page.

### Task 3.3: Report check
- What to build: compare the agent's AgentReport against the sum of ledger observations; differences listed as strings.
- File(s): `src/lib/ledger/report-check.ts`.
- Acceptance criteria: a report claiming a refund PayPal does not show yields MISMATCH with the difference listed.

### Task 3.4: Untrusted-text provenance
- What to build: when a read tool returns fields listed in untrustedFieldPaths, the gateway records which fields and passes them to the Watcher as "untrusted text the agent has read".
- Acceptance criteria: the Watcher prompt for the next action contains those fields; a test proves a run with no untrusted reads passes an empty list.

### Task 3.5: Real-discrepancy probe
- What to build: run at least 3 probes against the sandbox looking for a real gap between requested and recorded values (for example zero-decimal currency rounding, partial capture amounts, tax or unit total). Record every probe and result in `docs/LEDGER_PROBES.md`.
- Acceptance criteria: file lists at least 3 probes with results. If a real discrepancy exists, S4 is built on it. If none exists, S4 uses `FAULT_INJECTION=ledger_mismatch` and the UI shows a "FAULT INJECTION" banner.

### Task 4.1: Merchant Ops Assistant
- What to build: agent persona and runner. Task text: review the in-scope orders and disputes and issue only refunds allowed by merchant policy; final output is an AgentReport JSON.
- File(s): `src/lib/agent/*`.
- Acceptance criteria: the agent completes S1 in baseline mode using real toolkit calls.

### Task 4.2: Attack channels
- What to build: find which buyer-controlled fields can carry attacker text and be set by the seed script: preferred order 1) order fields a storefront would pass through from a buyer (shipping name, address line, item note), 2) invoice memo, 3) dispute message planted manually in the sandbox interface. Record which worked in `docs/ATTACK_CHANNELS.md`.
- Acceptance criteria: at least one automatable channel is confirmed with a screenshot path in the docs file; `POST /api/scenarios/S2/plant` and `/api/playground/plant` write attacker text into that channel.

### Task 4.3: Fool-rate measurement (proof the agent is really fooled)
- What to build: run S2 in baseline mode 10 times per candidate target model (Nemotron Super, Gemini Flash). Record how many times a real sandbox refund to the wrong target or over amount happened.
- File(s): `docs/TESTING.md`, README results table.
- Acceptance criteria: README shows "fooled k of 10" per model, including bad numbers; target model is the highest measured. If the best is below 3 of 10, write `// UNCLEAR: fool rate below 3/10` and stop to revise the attacker text.

### Task 4.4: Evals
- What to build: `evals/cases.json` with at least 20 cases (10 benign, 10 attack or drift) each with expected decision; a run script that prints accuracy, false-positive count and miss count.
- Acceptance criteria: results reported exactly as measured; no claim of 100% unless measured.

### Task 4.5: Watcher prompt for money context
- What to build: update the Watcher prompt so it receives: declared task, scope list, proposed action, rationale, recent steps, untrusted text read. It may only output the Restriction union.
- Acceptance criteria: eval run from Task 4.4 uses this prompt; output outside the union is rejected and the call is HELD.

### Task 5.1: Simulator page
- What to build: four scenario cards S1–S4, each with Run Baseline and Run Protected; side-by-side live timeline; a panel showing the PayPal object fetched through a read tool after the run (refund ID, amount, currency).
- File(s): `src/app/simulator/page.tsx`, `src/app/runs/[id]/page.tsx`.
- Acceptance criteria: running S2 baseline then protected produces the two outcomes in BUILD.md using real calls; the page never shows pre-written results.

### Task 5.2: Approvals and audit pages
- What to build: approver login, pending list, approve and reject buttons; audit page with a "Verify chain" button.
- Acceptance criteria: S3 holds, approval executes the call, ledger shows MATCH; tampering with one audit row in the database makes verify report the broken sequence number.

### Task 5.3: Playground page
- What to build: free text task box, free text attacker text box (500 characters maximum), run button, and rules view; approvers also get rule edits.
- Acceptance criteria: a judge-typed attacker text is written to the sandbox object and the agent reads it in the next run; 11th run in an hour from one IP returns a clear rate-limit message.

### Task 5.4: Deploy
- What to build: Vercel deployment with Neon; seeded sandbox; health page green.
- Acceptance criteria: a fresh browser can run S2 end to end on the hosted URL without any account; approver passcode is written in README for judges.

### Task 6.1: README and docs
- What to build: README with these sections in order: What it is; Why (neutral wording, link to `docs/PAYPAL_ISSUES.md` listing issues #82, #95, #104, #105, #114 of the agent-toolkit repo and issue #115's open fix with neutral phrasing); Judge quickstart (hosted URL, approver passcode, three clicks); Run locally; Architecture diagram; Defence layers and honest limits; Measured results (fool rates, evals); What is new versus Taut (`docs/WHAT_IS_NEW.md`); Tools and AI used and how; License.
- Acceptance criteria: a stranger can run the project from README alone; every number in README exists in `docs/TESTING.md`.

### Task 6.2: Demo video
- What to build: video under 3:00 following `docs/DEMO_SCRIPT.md` (script in INTEGRATION.md → Demo Path). Screen capture of the hosted app on a laptop browser.
- Acceptance criteria: length 2:40–2:55; no third-party logos other than the sandbox pages needed; no copyrighted music; spoken English.

### Task 6.3: Devpost submission text
- What to build: description covering features, how each AI tool was used, what was significantly updated during the submission period, repo link, hosted URL, video link.
- Acceptance criteria: matches the checklist in INTEGRATION.md → Submission Checklist.

### Task 6.4: Final checks and submit
- What to build: run the checklist; submit by Nov 11, 8:00 pm IST.
- Acceptance criteria: submission shows as "Submitted" on Devpost, not draft.

## Contracts You Must Honor

All contracts in BUILD.md (data models, endpoints, env vars, safety invariants, money rules, scenarios).

## DO NOT

- Do not build anything outside your scope list
- Do not modify the Taut repository
- Do not change the shared contract definitions
- Do not add packages without updating the master BUILD.md first
- Do not start the PayPal pull request work before the submission is complete
