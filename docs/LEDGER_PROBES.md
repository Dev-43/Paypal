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

---

## 3. Live End-to-End Money Movement Verification Probe (Task 1.1 & Task 3.5)

Executed live against PayPal Sandbox with the US Merchant credentials (`sb-x438ao53656971@business.example.com`).

### Execution Trace & Evidence

1. **Step 1: Automated Order Creation & Direct Card Capture**
   - **Endpoint**: `POST https://api-m.sandbox.paypal.com/v2/checkout/orders`
   - **Payload**:
     - `intent`: `CAPTURE`
     - `amount`: `$12.00 USD`
     - `payment_source`: `card` (`4111111111111111`, expiry `2028-12`, security code `123`)
   - **Result Status**: `HTTP 201 Created` / `COMPLETED`
   - **Order ID**: `563947470G499174V`
   - **Capture ID**: `96V72827VX7576722`
   - **Captured Amount**: `$12.00 USD` (Gross: `$12.00`, Fee: `$0.80`, Net: `$11.20`)
   - **Processor Response**: `response_code: "0000"` (Approved)

2. **Step 2: Partial Refund via Agent Toolkit (`create_refund`)**
   - **Tool**: `create_refund`
   - **Payload**:
     - `capture_id`: `96V72827VX7576722`
     - `amount`: `{ "currency_code": "USD", "value": "5.00" }`
     - `note_to_payer`: `"Partial return refund for defective item"`
   - **Result Status**: `SUCCESS`
   - **Refund ID**: `3GU42620XP462460G`
   - **Refund Status**: `COMPLETED`

3. **Step 3: Post-Execution Ledger Truth Read-Back (`get_refund`)**
   - **Tool**: `get_refund`
   - **Payload**: `{ "refund_id": "3GU42620XP462460G" }`
   - **Result Status**: `SUCCESS`
   - **Ledger Record Retrieved**:
     - `amount.value`: `"5.00"`
     - `amount.currency_code`: `"USD"`
     - `status`: `"COMPLETED"`
     - `links.up`: `https://api.sandbox.paypal.com/v2/payments/captures/96V72827VX7576722`

4. **Step 4: Truth Comparison (Requested vs Recorded)**
   - **Amount**: Requested `5.00 USD` vs Recorded `5.00 USD` -> **MATCH**
   - **Currency**: Requested `USD` vs Recorded `USD` -> **MATCH**
   - **Target Capture**: Requested `96V72827VX7576722` vs Recorded Capture `96V72827VX7576722` -> **MATCH**
   - **Overall Ledger Verification**: **VERIFIED MATCH**

---

### Probe 4: Zero-Decimal Currency Formatting (JPY)
- **Execution Date**: 2026-11-07
- **Test 4A (Fractional decimals in zero-decimal currency)**:
  - **Payload**: `currency_code`: `"JPY"`, `value`: `"1500.50"`
  - **Endpoint**: `POST /v2/checkout/orders`
  - **Real HTTP Status**: `422 Unprocessable Entity`
  - **Real Response**:
    ```json
    {
      "name": "UNPROCESSABLE_ENTITY",
      "details": [
        {
          "field": "/purchase_units/@reference_id=='default'/amount/value",
          "value": "1500.50",
          "issue": "DECIMALS_NOT_SUPPORTED",
          "description": "Currency does not support decimals. Please refer to https://developer.paypal.com/docs/integration/direct/rest/currency-codes/ for more information."
        }
      ],
      "message": "The requested action could not be performed, semantically incorrect, or failed business validation."
    }
    ```
- **Test 4B (Proper integer units for zero-decimal currency)**:
  - **Payload**: `currency_code`: `"JPY"`, `value`: `"1500"`
  - **Real HTTP Status**: `201 Created`
  - **Captured Status**: `COMPLETED` (Capture ID: `8BA61636WR1222117`)
- **Key Finding**: PayPal REST API strictly rejects non-integer strings for zero-decimal currencies like JPY with `DECIMALS_NOT_SUPPORTED`. Pawl's `src/lib/rules/currency.ts` zero-decimal normalization guarantees mathematical alignment before tool dispatch.

---

### Probe 5: Refund Larger Than Remaining Captured Amount
- **Execution Date**: 2026-11-07
- **Target Capture**: `96V72827VX7576722` (Gross: `$12.00 USD`, previous partial refund: `$5.00 USD`, remaining unrefunded balance: `$7.00 USD`).
- **Requested Refund**: `$15.00 USD` via `create_refund`.
- **Real Response**:
  ```json
  {
    "ok": false,
    "status": 422,
    "code": "PAYPAL_API_HTTP_ERROR",
    "message": "The requested action could not be performed, semantically incorrect, or failed business validation.: The refund amount must be less than or equal to the capture amount that has not yet been refunded."
  }
  ```
- **Key Finding**: PayPal's ledger strictly enforces that the cumulative refunded amount cannot exceed the original gross capture. When an unmitigated agent attempts to issue multiple or excess refunds, PayPal fails with HTTP 422. Pawl's Rule P2 (per-transaction cap) and Rule P4 (cumulative dispute/capture cap) prevent such attempts prior to dispatch.
