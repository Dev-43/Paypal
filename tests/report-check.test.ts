import { describe, it, expect } from "vitest";
import { checkAgentReport, AgentReport } from "../src/lib/ledger/report-check";
import { LedgerCheck } from "../src/lib/ledger/check";

describe("Agent Report Check (Task 3.3)", () => {
  it("yields MATCH when report claims agree with ledger checks", () => {
    const report: AgentReport = {
      runId: "run-rep-1",
      summary: "Processed refund successfully",
      actions: [
        {
          tool: "create_refund",
          amount: "25.00",
          currency: "USD",
          target: "CAP-001",
          claimedStatus: "executed",
        },
      ],
    };

    const ledgerChecks: LedgerCheck[] = [
      {
        callId: "call-1",
        status: "MATCH",
        expected: { amountMinor: 2500, currency: "USD", target: "CAP-001" },
        observed: { amountMinor: 2500, currency: "USD", target: "CAP-001" },
        detail: "Match",
        checkedAt: new Date().toISOString(),
      },
    ];

    const result = checkAgentReport(report, ledgerChecks);
    expect(result.status).toBe("MATCH");
    expect(result.differences.length).toBe(0);
  });

  it("yields MISMATCH with difference listed when report claims refund PayPal does not show", () => {
    const report: AgentReport = {
      runId: "run-rep-2",
      summary: "I refunded $50 to order 999",
      actions: [
        {
          tool: "create_refund",
          amount: "50.00",
          currency: "USD",
          target: "CAP-999",
          claimedStatus: "executed",
        },
      ],
    };

    // Ledger checks empty or contains no such refund
    const ledgerChecks: LedgerCheck[] = [];

    const result = checkAgentReport(report, ledgerChecks);

    // Acceptance criteria: a report claiming a refund PayPal does not show yields MISMATCH with the difference listed
    expect(result.status).toBe("MISMATCH");
    expect(result.differences.length).toBeGreaterThan(0);
    expect(result.differences[0]).toContain("Agent claimed executed 'create_refund' for 50.00 USD");
  });
});
