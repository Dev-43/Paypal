import { describe, it, expect } from "vitest";
import { evaluateMoneyRules, EvaluationContext } from "../src/lib/rules/money-rules";
import { toMinorUnits, fromMinorUnits } from "../src/lib/rules/currency";

describe("Deterministic Money Rules (Tasks 2.1, 2.2, 2.3)", () => {
  const baseContext: EvaluationContext = {
    runId: "test-run",
    stepIndex: 1,
    tool: "create_refund",
    args: {
      capture_id: "CAP-100",
      amount: { value: "25.00", currency_code: "USD" },
    },
    declaredScopeIds: ["CAP-100"],
    allowedTools: ["create_refund", "get_order", "create_invoice"],
    accumulatedSpendMinor: 0,
    captureLookup: async () => ({
      remainingRefundableAmount: "100.00",
      currency: "USD",
    }),
  };

  describe("Currency Exponents & Minor Units (Task 2.1)", () => {
    it("handles standard 2-decimal currencies (USD)", () => {
      expect(toMinorUnits("50.00", "USD")).toBe(5000);
      expect(toMinorUnits("0.05", "USD")).toBe(5);
      expect(fromMinorUnits(5000, "USD")).toBe("50.00");
    });

    it("handles zero-decimal currencies (JPY) with exponent 0", () => {
      expect(toMinorUnits("5000", "JPY")).toBe(5000);
      expect(toMinorUnits("5000.75", "JPY")).toBe(5000); // Truncates decimal without float error
      expect(fromMinorUnits(5000, "JPY")).toBe("5000");
    });

    it("handles 3-decimal currencies (KWD)", () => {
      expect(toMinorUnits("10.500", "KWD")).toBe(10500);
      expect(fromMinorUnits(10500, "KWD")).toBe("10.500");
    });
  });

  describe("P2: Per-Call Cap (≤ 50.00 USD)", () => {
    it("allows amount below cap ($25.00)", async () => {
      const verdict = await evaluateMoneyRules({
        ...baseContext,
        args: { capture_id: "CAP-100", amount: { value: "25.00", currency_code: "USD" } },
      });
      expect(verdict.decision).toBe("allow");
    });

    it("allows exact boundary amount ($50.00)", async () => {
      const verdict = await evaluateMoneyRules({
        ...baseContext,
        args: { capture_id: "CAP-100", amount: { value: "50.00", currency_code: "USD" } },
      });
      expect(verdict.decision).toBe("allow");
    });

    it("holds amount exceeding cap ($50.01)", async () => {
      const verdict = await evaluateMoneyRules({
        ...baseContext,
        args: { capture_id: "CAP-100", amount: { value: "50.01", currency_code: "USD" } },
      });
      expect(verdict.decision).toBe("held");
      expect(verdict.ruleId).toBe("P2");
    });

    it("evaluates JPY zero-decimal cap correctly", async () => {
      const verdict = await evaluateMoneyRules({
        ...baseContext,
        config: { allowedCurrencies: ["JPY"], perCallCapUsd: 5000 },
        args: { capture_id: "CAP-100", amount: { value: "5001", currency_code: "JPY" } },
        captureLookup: async () => ({ remainingRefundableAmount: "10000", currency: "JPY" }),
      });
      expect(verdict.decision).toBe("held");
      expect(verdict.ruleId).toBe("P2");
    });
  });

  describe("P4: Daily Run Budget (≤ 200.00 USD)", () => {
    it("allows spend within budget ($150 total)", async () => {
      const verdict = await evaluateMoneyRules({
        ...baseContext,
        accumulatedSpendMinor: 10000, // $100 prior spend
        args: { capture_id: "CAP-100", amount: { value: "50.00", currency_code: "USD" } },
      });
      expect(verdict.decision).toBe("allow");
    });

    it("allows exact budget boundary ($200 total)", async () => {
      const verdict = await evaluateMoneyRules({
        ...baseContext,
        accumulatedSpendMinor: 15000, // $150 prior spend
        args: { capture_id: "CAP-100", amount: { value: "50.00", currency_code: "USD" } },
      });
      expect(verdict.decision).toBe("allow");
    });

    it("holds spend exceeding budget ($200.01 total)", async () => {
      const verdict = await evaluateMoneyRules({
        ...baseContext,
        accumulatedSpendMinor: 16000, // $160 prior spend
        args: { capture_id: "CAP-100", amount: { value: "45.00", currency_code: "USD" } },
      });
      expect(verdict.decision).toBe("held");
      expect(verdict.ruleId).toBe("P4");
    });
  });

  describe("P5: Currency Allow-List", () => {
    it("allows permitted currency (USD)", async () => {
      const verdict = await evaluateMoneyRules({
        ...baseContext,
        args: { capture_id: "CAP-100", amount: { value: "20.00", currency_code: "USD" } },
      });
      expect(verdict.decision).toBe("allow");
    });

    it("blocks unpermitted currency (EUR)", async () => {
      const verdict = await evaluateMoneyRules({
        ...baseContext,
        args: { capture_id: "CAP-100", amount: { value: "20.00", currency_code: "EUR" } },
      });
      expect(verdict.decision).toBe("blocked");
      expect(verdict.ruleId).toBe("P5");
    });

    it("blocks custom crypto or invalid currency", async () => {
      const verdict = await evaluateMoneyRules({
        ...baseContext,
        args: { capture_id: "CAP-100", amount: { value: "20.00", currency_code: "BTC" } },
      });
      expect(verdict.decision).toBe("blocked");
      expect(verdict.ruleId).toBe("P5");
    });
  });

  describe("P3: Refund vs Remaining Capture Balance (Task 2.2)", () => {
    it("allows refund within remaining balance ($30 ≤ $100)", async () => {
      const verdict = await evaluateMoneyRules({
        ...baseContext,
        args: { capture_id: "CAP-100", amount: { value: "30.00", currency_code: "USD" } },
        captureLookup: async () => ({ remainingRefundableAmount: "100.00", currency: "USD" }),
      });
      expect(verdict.decision).toBe("allow");
    });

    it("allows exact remaining balance boundary ($40 ≤ $40)", async () => {
      const verdict = await evaluateMoneyRules({
        ...baseContext,
        args: { capture_id: "CAP-100", amount: { value: "40.00", currency_code: "USD" } },
        captureLookup: async () => ({ remainingRefundableAmount: "40.00", currency: "USD" }),
      });
      expect(verdict.decision).toBe("allow");
    });

    it("blocks refund exceeding remaining balance ($45 > $40)", async () => {
      const verdict = await evaluateMoneyRules({
        ...baseContext,
        args: { capture_id: "CAP-100", amount: { value: "45.00", currency_code: "USD" } },
        captureLookup: async () => ({ remainingRefundableAmount: "40.00", currency: "USD" }),
      });
      expect(verdict.decision).toBe("blocked");
      expect(verdict.ruleId).toBe("P3");
    });

    it("fails closed to HELD when pre-flight read fails", async () => {
      const verdict = await evaluateMoneyRules({
        ...baseContext,
        args: { capture_id: "CAP-100", amount: { value: "20.00", currency_code: "USD" } },
        captureLookup: async () => {
          throw new Error("PayPal read timeout");
        },
      });
      expect(verdict.decision).toBe("held");
      expect(verdict.ruleId).toBe("P3");
    });
  });

  describe("P7: Declared Scope List Check (Task 2.2)", () => {
    it("allows target within declared scope", async () => {
      const verdict = await evaluateMoneyRules({
        ...baseContext,
        declaredScopeIds: ["CAP-100", "CAP-101"],
        args: { capture_id: "CAP-100", amount: { value: "10.00", currency_code: "USD" } },
      });
      expect(verdict.decision).toBe("allow");
    });

    it("blocks target outside declared scope", async () => {
      const verdict = await evaluateMoneyRules({
        ...baseContext,
        declaredScopeIds: ["CAP-100"],
        args: { capture_id: "CAP-999-UNAUTHORIZED", amount: { value: "10.00", currency_code: "USD" } },
      });
      expect(verdict.decision).toBe("blocked");
      expect(verdict.ruleId).toBe("P7");
    });

    it("blocks get_order when order ID is out of scope", async () => {
      const verdict = await evaluateMoneyRules({
        ...baseContext,
        tool: "get_order",
        declaredScopeIds: ["ORD-1"],
        args: { id: "ORD-2-OUT-OF-SCOPE" },
      });
      expect(verdict.decision).toBe("blocked");
      expect(verdict.ruleId).toBe("P7");
    });
  });

  describe("P6: Invoice Merchant Contact Allow-List (Task 2.2)", () => {
    it("allows invoice recipient in contact list", async () => {
      const verdict = await evaluateMoneyRules({
        ...baseContext,
        tool: "create_invoice",
        config: { allowedMerchantContacts: ["partner@trusted.com"] },
        args: {
          currency_code: "USD",
          items: [{ unit_amount: { value: "20.00" } }],
          primary_recipients: [{ billing_info: { email_address: "partner@trusted.com" } }],
        },
      });
      expect(verdict.decision).toBe("allow");
    });

    it("holds invoice recipient not in contact list", async () => {
      const verdict = await evaluateMoneyRules({
        ...baseContext,
        tool: "create_invoice",
        config: { allowedMerchantContacts: ["partner@trusted.com"] },
        args: {
          currency_code: "USD",
          items: [{ unit_amount: { value: "20.00" } }],
          primary_recipients: [{ billing_info: { email_address: "attacker@external.com" } }],
        },
      });
      expect(verdict.decision).toBe("held");
      expect(verdict.ruleId).toBe("P6");
    });
  });

  describe("P8: Step Budget and Precedence (Task 2.3)", () => {
    it("freezes run when step count exceeds 25", async () => {
      const verdict = await evaluateMoneyRules({
        ...baseContext,
        stepIndex: 26,
      });
      expect(verdict.decision).toBe("frozen");
      expect(verdict.ruleId).toBe("P8");
    });

    it("allows step at exact boundary (step 25)", async () => {
      const verdict = await evaluateMoneyRules({
        ...baseContext,
        stepIndex: 25,
      });
      expect(verdict.decision).toBe("allow");
    });

    it("enforces precedence: rule block overrules any prospective allow", async () => {
      // Simulating a scenario where target is out of scope
      const verdict = await evaluateMoneyRules({
        ...baseContext,
        declaredScopeIds: ["CAP-ALLOWED"],
        args: { capture_id: "CAP-FORBIDDEN", amount: { value: "10.00", currency_code: "USD" } },
      });
      // Invariant 3: deterministic rules return blocked/held; Watcher cannot override this
      expect(verdict.decision).toBe("blocked");
      expect(verdict.ruleId).toBe("P7");
    });
  });
});
