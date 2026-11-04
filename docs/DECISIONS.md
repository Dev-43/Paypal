# Architecture & Build Decisions (Pawl)

## Decision Log

### DEC-001: Temporary Hold on Live PayPal Sandbox API Testing (SMS OTP Issue)
- **Date**: Nov 4, 2026
- **Status**: Active
- **Context**: The owner experienced a PayPal Developer Portal SMS 2FA delivery issue ("can't send code to this number") preventing immediate generation of fresh sandbox app keys.
- **Decision**: Keep live PayPal sandbox calls at bay to maintain development velocity. Proceed immediately with all downstream components:
  1. Complete W4 (Agent runner, prompt injection scenarios S1–S4, Watcher intent model cascade, eval benchmarks).
  2. Complete W5 (Simulator UI, Approval Terminal, Audit Verification, Playground, and Health routes).
  3. Keep the PayPal token service (`src/lib/paypal/token.ts`) and executor (`src/lib/paypal/executor.ts`) ready to ingest real credentials as soon as the portal issue resolves.
- **Acceptance Impact**: All unit tests and simulated scenarios run cleanly; live sandbox seed and live run verification will be executed once the developer portal allows sign-in.
