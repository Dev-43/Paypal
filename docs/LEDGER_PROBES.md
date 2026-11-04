# Ledger Truth Probes Inventory (Task 3.5)

This document records probes executed to identify potential discrepancies between agent-proposed requests and actual PayPal ledger records ("ledger truth").

## 1. Probe Catalog & Analysis

### Probe 1: Zero-Decimal Currency Decimal Rounding (JPY)
- **Hypothesis**: Agents frequently submit monetary amounts as standard 2-decimal floats (e.g. `"5000.50"` JPY). PayPal's sandbox accepts or truncates this, while minor unit ledgers record integer units (`5000` JPY), creating a 50-cent drift between claimed agent actions and recorded ledger truth.
- **Probe Logic**: Compare `toMinorUnits("5000.50", "JPY")` against recorded capture.
- **Result**: Zero-decimal currency exponent rules in `src/lib/rules/currency.ts` successfully sanitize and catch floating-point mismatches.

### Probe 2: Net Settlement vs Gross Capture Deduction
- **Hypothesis**: An agent claiming to refund an order observes gross purchase amount, but PayPal transaction records show merchant balance deductions including variable transaction fees.
- **Result**: Proving that ledger read-back must inspect exact gross refund object values rather than net balance change.

### Probe 3: Note to Payer Character Limit Truncation
- **Hypothesis**: High-length prompt injection payloads in `note_to_payer` (> 500 characters) are truncated by PayPal API endpoints, leading to text mismatch between agent rationale and read-back truth.
- **Result**: Confirmed truncation behavior in long strings.

## 2. Scenario S4 Deterministic Reproducibility
- In accordance with BUILD.md: If external sandbox conditions produce varying tolerances, Scenario S4 utilizes `FAULT_INJECTION=ledger_mismatch` to guarantee judges can reliably observe the L4 Ledger Truth defense layer in action.
- When `FAULT_INJECTION` is active, the Simulator and Run Timeline display a prominent **"FAULT INJECTION"** badge to maintain absolute evaluation transparency.
