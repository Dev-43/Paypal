/**
 * Agent Report Verification (Task 3.3)
 * Compares the agent's final AgentReport against the sum of ledger observations.
 * Flag any discrepancy as MISMATCH with a list of difference descriptions.
 */

import { LedgerCheck } from "./check";
import { toMinorUnits } from "../rules/currency";

export interface ClaimedAction {
  tool: string;
  amount?: string | number;
  currency?: string;
  target?: string;
  claimedStatus: "executed" | "failed" | "blocked" | "held";
}

export interface AgentReport {
  runId: string;
  summary: string;
  actions: ClaimedAction[];
}

export interface ReportCheck {
  runId: string;
  status: "MATCH" | "MISMATCH";
  differences: string[];
  checkedAt: string;
}

export function checkAgentReport(
  report: AgentReport,
  ledgerChecks: LedgerCheck[]
): ReportCheck {
  const differences: string[] = [];

  // Match claimed executed actions against actual observed ledger checks
  for (const claimed of report.actions) {
    if (claimed.claimedStatus === "executed") {
      const currency = (claimed.currency || "USD").toUpperCase();
      const claimedMinor = claimed.amount !== undefined ? toMinorUnits(claimed.amount, currency) : 0;
      const claimedTarget = String(claimed.target || "").trim();

      const matchedCheck = ledgerChecks.find((lc) => {
        if (!lc.observed) return false;
        const amountMatches = lc.observed.amountMinor === claimedMinor;
        const curMatches = lc.observed.currency === currency;
        const targetMatches = !claimedTarget || lc.observed.target === claimedTarget;
        return amountMatches && curMatches && targetMatches;
      });

      if (!matchedCheck) {
        differences.push(
          `Agent claimed executed '${claimed.tool}' for ${claimed.amount} ${currency} (target: '${claimedTarget}'), but PayPal ledger records no matching successful transaction.`
        );
      } else if (matchedCheck.status === "MISMATCH") {
        differences.push(
          `Agent claimed successful execution for '${claimed.tool}', but ledger read-back detected an amount/target mismatch.`
        );
      }
    }
  }

  // Also verify that no observed ledger moves were omitted from the report
  const observedChecks = ledgerChecks.filter(
    (lc) => lc.observed !== null && lc.status === "MATCH"
  );
  if (observedChecks.length > 0 && report.actions.length === 0) {
    differences.push(
      `PayPal recorded ${observedChecks.length} successful transactions that were omitted from the agent report.`
    );
  }

  const status = differences.length === 0 ? "MATCH" : "MISMATCH";

  return {
    runId: report.runId,
    status,
    differences,
    checkedAt: new Date().toISOString(),
  };
}
