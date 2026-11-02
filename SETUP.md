# SETUP.md — Pawl: accounts, keys and environment

> Fill this in on your own machine. Never paste secrets into chat, commits, screenshots or the README. `.env.local` must be listed in `.gitignore` before the first commit. If a secret leaks, rotate it immediately.

This file supports Tasks 1.1 and 1.3 in BUILD_solo-tasks.md. Names of buttons may differ slightly from what is written here; if a page looks different, search the dashboard menu for the item name.

## 1. Fill-in sheet (no secrets in this table)

| Item | Where you get it | Your value (non-secret only) | Done |
|---|---|---|---|
| PayPal Developer account | developer.paypal.com (log in with a PayPal account or create one) | account email | [ ] |
| Sandbox app name | Dashboard → Apps & Credentials → Sandbox | app name | [ ] |
| Sandbox business (merchant) email | Dashboard → Testing tools → Sandbox accounts | email | [ ] |
| Sandbox buyer A email | same page, personal account | email | [ ] |
| Sandbox buyer B email | same page, personal account | email | [ ] |
| Nebius Token Factory key | tokenfactory.nebius.com | credits left (approx.) | [ ] |
| Gemini key (fallback) | aistudio.google.com, API keys | project name | [ ] |
| Neon project | neon.tech | project name, region | [ ] |
| GitHub repo `pawl` (public, MIT) | github.com | repo URL | [ ] |
| Vercel project | vercel.com | project URL | [ ] |
| YouTube channel for the demo video | youtube.com | channel URL | [ ] |

## 2. PayPal sandbox (do this first)

1. Log in at the PayPal Developer Dashboard (developer.paypal.com/dashboard).
2. Switch the environment toggle to **Sandbox**. Never use Live.
3. Open Apps & Credentials, create an app of the merchant type, and copy the **Client ID** and **Secret** into `.env.local` only.
4. Open Testing tools → Sandbox accounts. Keep the default business account as your merchant. Create two personal (buyer) accounts: country US, currency USD, with a funded balance.
5. Write the three sandbox emails in the fill-in sheet above.
6. Official references from the hackathon page: PayPal Developer docs (developer.paypal.com), PayPal AI docs (docs.paypal.ai), Agent Toolkit quickstart (docs.paypal.ai/developer/tools/ai/agent-toolkit-quickstart), MCP quickstart (docs.paypal.ai/developer/tools/ai/mcp-quickstart), and the sandbox starter repository (github.com/paypaldev/getting-started-with-paypal-sandbox).
7. Sandbox access tokens expire (roughly 3 to 8 hours according to the toolkit README). This is why Task 1.3 builds automatic refresh.

Check: you can create one order and capture it through the toolkit, and the capture shows in the sandbox dashboard (acceptance criteria of Task 1.1).

## 3. Models

- **Nebius Token Factory** (Watcher and Interpreter): create or reuse your key. Note the remaining credit in the sheet. Taut's average run cost was small, but the spend guard still applies.
- **Gemini API** (fallback): create a key in AI Studio. The free tier needs no card, and limits are shown on the AI Studio rate-limit page, not in the docs. Free-tier content may be used by Google to improve its products, so send sandbox data only.

## 4. Database

1. Create a Neon project.
2. Copy two connection strings: the pooled one for `DATABASE_URL` and the direct one for `DIRECT_URL`.

## 5. Secrets you generate yourself

| Variable | How |
|---|---|
| SESSION_SECRET | a random 64-character hex string (generate with any secure random generator on your machine) |
| DEMO_AGENT_KEY | a long random string you choose |
| APPROVER_PASSCODE | a passcode you choose; it will be written in the README for judges, so use one that is used nowhere else |

## 6. `.env.local` template (create the file yourself; keep it out of git)

```
PAYPAL_ENV=sandbox
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_BUYER_A_EMAIL=
PAYPAL_BUYER_B_EMAIL=
NEBIUS_API_KEY=
GEMINI_API_KEY=
DATABASE_URL=
DIRECT_URL=
APPROVER_PASSCODE=
SESSION_SECRET=
DEMO_AGENT_KEY=
SPEND_GUARD_USD=
FAULT_INJECTION=
```

Rules for these values:
- `PAYPAL_ENV` must be exactly `sandbox`. The app refuses to start otherwise.
- `FAULT_INJECTION` stays empty except when you deliberately run the labelled S4 fault-injection scenario.
- `GEMINI_API_KEY` is optional.
- `SPEND_GUARD_USD` is a small daily cap in dollars that you choose, based on your remaining Nebius credit.

## 7. Verify before you start Task 1.2

The health endpoint must report:
- PayPal environment: sandbox
- Database: connected
- PayPal token: valid, with remaining lifetime shown
- Nebius: reachable
- Gemini: reachable, or "not configured"

## 8. Vercel (Day 8, not before)

1. Import the repo into Vercel.
2. Add every variable from the template in the project settings. Leave `FAULT_INJECTION` empty in production.
3. Deploy, open the health endpoint on the hosted URL, and run S2 once.

## 9. What judges may see, and what they must never see

| Goes in the README | Never goes anywhere public |
|---|---|
| hosted URL, approver passcode, the three-click quickstart | PayPal Client Secret, Nebius key, Gemini key, database strings, SESSION_SECRET, DEMO_AGENT_KEY |

Sandbox buyer and merchant emails may appear in docs; sandbox passwords may not.
