# Pawl — Tighten-Only Guard Layer for PayPal Agent Toolkit

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Hackathon](https://img.shields.io/badge/PayPal-AI_Hackathon-003087.svg)](https://devpost.com)
[![Models](https://img.shields.io/badge/NVIDIA-Nemotron_3_(Nano_/_Super_/_Ultra)-green.svg)](https://tokenfactory.nebius.com)

**Pawl** is a tighten-only guard layer between an AI agent and PayPal's `@paypal/agent-toolkit` tools (PayPal sandbox only). Every tool call proposed by an agent passes through a Gateway that classifies the tool, applies deterministic money rules (P1–P8), asks an intent Watcher model, holds risky calls for human approval, executes through the PayPal agent toolkit, and reads back results from PayPal ("ledger truth") to compare against agent claims. Permissions can only shrink automatically; only an authenticated human can widen them.

---

## The Headline Demo

A hostile instruction hidden in buyer-controlled text on a PayPal sandbox object (order shipping address, invoice memo, or dispute note) attempts to trick an unguarded agent into executing an unauthorized sandbox refund.
- **Baseline Run**: Unguarded agent obeys the injection and issues the refund.
- **Protected Run**: Pawl deterministic money rules and intent Watcher intercept the call, hold it for human approval, freeze the run upon discrepancy, and disable the compromised tool.

---

## Defence Layers (Fixed Order)

| Layer | Name | What it does | If it fails |
|---|---|---|---|
| L0 | Classification | Tool must exist in the registry; class is read, money_move or config | unknown tool → BLOCKED |
| L1 | Money rules P1–P8 | Deterministic checks (caps, scope, budget, currencies) | rule error → HELD |
| L2 | Watcher | Model checks action against declared task and inspects untrusted text | model error or timeout (8s) → HELD |
| L3 | Human approval | HELD calls wait in the approver queue | no decision → stays HELD |
| L4 | Ledger truth | Read back from PayPal post-execution to verify against agent claim | mismatch → freeze run; unverifiable → require_approval |
| L5 | Audit + briefing | Hash-chained event log, plain-language incident briefing | audit write failure → run frozen |

> **Honest Limit**: A refund that has already executed cannot be undone by this system. L4 contains the damage (freeze run, disable tool, capture evidence) but does not reverse it.

---

## Tech Stack

- **Runtime**: Node.js 20+
- **Framework**: Next.js 14 (App Router) + TypeScript
- **Styling**: Tailwind CSS
- **Database**: Neon Postgres via Prisma
- **Tests**: Vitest
- **PayPal**: `@paypal/agent-toolkit` (sandbox only)
- **Watcher & Interpreter Models**: NVIDIA Nemotron tiers on Nebius Token Factory
- **Fallback**: Gemini API (plain fetch)

---

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL database (e.g. Neon)
- PayPal Developer Sandbox credentials

### Installation

```bash
git clone <repo-url>
cd pawl
npm install
npx prisma generate
```

### Environment Setup

Copy `.env.example` to `.env.local` and populate:
```bash
cp .env.example .env.local
```
Ensure `PAYPAL_ENV=sandbox`. Pawl refuses to start if `PAYPAL_ENV` is not `sandbox`.

### Running Tests

```bash
npm test
```

---

## License

[MIT](LICENSE)
