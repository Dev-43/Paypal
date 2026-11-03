/**
 * Deterministic Money Rules P1–P8 (Task 2.1, 2.2, 2.3)
 * Evaluated at Layer 1 (L1) before any Watcher evaluation.
 * Invariant 3: Deterministic rules always override a Watcher "allow".
 * Invariant 6: Minor unit comparisons only; never compare floats.
 */

import { toMinorUnits } from "./currency";
import { getRegistryEntry } from "../paypal/registry";

export type RuleDecision = "allow" | "held" | "blocked" | "frozen";

export interface RuleVerdict {
  decision: RuleDecision;
  ruleId: "P1" | "P2" | "P3" | "P4" | "P5" | "P6" | "P7" | "P8" | null;
  reason: string;
}

export interface MoneyRuleConfig {
  perCallCapUsd: number; // default 50.00
  dailyBudgetUsd: number; // default 200.00
  allowedCurrencies: string[]; // default ["USD"]
  allowedMerchantContacts: string[];
  maxSteps: number; // default 25
}

export const DEFAULT_MONEY_RULE_CONFIG: MoneyRuleConfig = {
  perCallCapUsd: 50.0,
  dailyBudgetUsd: 200.0,
  allowedCurrencies: ["USD"],
  allowedMerchantContacts: [],
  maxSteps: 25,
};

export interface EvaluationContext {
  runId: string;
  stepIndex: number;
  tool: string;
  args: Record<string, any>;
  declaredScopeIds: string[];
  allowedTools: string[];
  accumulatedSpendMinor: number; // in USD minor units (cents)
  config?: Partial<MoneyRuleConfig>;
  // Pre-flight reader for P3
  captureLookup?: (captureId: string) => Promise<{ remainingRefundableAmount: string; currency: string } | null>;
}

function extractByPath(obj: any, path?: string): any {
  if (!obj || !path) return undefined;
  return path.split(".").reduce((acc, part) => (acc ? acc[part] : undefined), obj);
}

export async function evaluateMoneyRules(
  ctx: EvaluationContext
): Promise<RuleVerdict> {
  const config: MoneyRuleConfig = {
    ...DEFAULT_MONEY_RULE_CONFIG,
    ...(ctx.config || {}),
  };

  // --- P8: Step count budget (≤ 25) ---
  if (ctx.stepIndex > config.maxSteps) {
    return {
      decision: "frozen",
      ruleId: "P8",
      reason: `Step count ${ctx.stepIndex} exceeded maximum step budget of ${config.maxSteps}. Run frozen.`,
    };
  }

  // --- P1: Tool is on the run's allow-list ---
  if (ctx.allowedTools.length > 0 && !ctx.allowedTools.includes(ctx.tool)) {
    return {
      decision: "blocked",
      ruleId: "P1",
      reason: `Tool '${ctx.tool}' is not in the declared allow-list for this run.`,
    };
  }

  const registryEntry = getRegistryEntry(ctx.tool);
  if (!registryEntry) {
    return {
      decision: "blocked",
      ruleId: "P1",
      reason: `Tool '${ctx.tool}' is absent from registry (L0 failure).`,
    };
  }

  // For read tools without money effects, verify scope if applicable
  if (registryEntry.class === "read") {
    // P7: Scope check for targeted reads (orders, disputes)
    if (ctx.tool === "get_order" && ctx.args.id) {
      if (ctx.declaredScopeIds.length > 0 && !ctx.declaredScopeIds.includes(ctx.args.id)) {
        return {
          decision: "blocked",
          ruleId: "P7",
          reason: `Target order ID '${ctx.args.id}' is not in declared scope list.`,
        };
      }
    }
    if (ctx.tool === "get_dispute" && ctx.args.dispute_id) {
      if (ctx.declaredScopeIds.length > 0 && !ctx.declaredScopeIds.includes(ctx.args.dispute_id)) {
        return {
          decision: "blocked",
          ruleId: "P7",
          reason: `Target dispute ID '${ctx.args.dispute_id}' is not in declared scope list.`,
        };
      }
    }

    return {
      decision: "allow",
      ruleId: null,
      reason: "Read tool permitted under deterministic rules.",
    };
  }

  // --- Money Move Rules (P2, P3, P4, P5, P6, P7) ---
  const currency = (
    extractByPath(ctx.args, registryEntry.currencyPath) || "USD"
  ).toUpperCase();

  // P5: Currency is in the allow-list (default USD)
  const allowedCurrencies = config.allowedCurrencies.map((c) => c.toUpperCase());
  if (!allowedCurrencies.includes(currency)) {
    return {
      decision: "blocked",
      ruleId: "P5",
      reason: `Currency '${currency}' is not in allowed currencies list [${allowedCurrencies.join(", ")}].`,
    };
  }

  // Extract amount in minor units
  const rawAmount = extractByPath(ctx.args, registryEntry.amountPath);
  let amountMinor = 0;
  if (rawAmount !== undefined && rawAmount !== null) {
    amountMinor = toMinorUnits(rawAmount, currency);
  }

  // P2: money_move amount ≤ per-call cap (default 50.00 USD)
  const perCallCapMinor = toMinorUnits(config.perCallCapUsd, currency);
  if (amountMinor > perCallCapMinor) {
    return {
      decision: "held",
      ruleId: "P2",
      reason: `Requested amount (${rawAmount} ${currency}) exceeds per-call cap of ${config.perCallCapUsd} ${currency}. Held for approval.`,
    };
  }

  // P4: Sum of money_move amounts in run ≤ daily budget (default 200.00 USD)
  const dailyBudgetMinor = toMinorUnits(config.dailyBudgetUsd, currency);
  const projectedTotalMinor = ctx.accumulatedSpendMinor + amountMinor;
  if (projectedTotalMinor > dailyBudgetMinor) {
    return {
      decision: "held",
      ruleId: "P4",
      reason: `Projected spend exceeds run budget of ${config.dailyBudgetUsd} ${currency}. Held for approval.`,
    };
  }

  // P7: Target order, dispute, or capture ID is in the run's declared scope list
  if (ctx.tool !== "create_invoice") {
    const targetId = extractByPath(ctx.args, registryEntry.targetPath);
    if (targetId && ctx.declaredScopeIds.length > 0) {
      if (!ctx.declaredScopeIds.includes(targetId)) {
        return {
          decision: "blocked",
          ruleId: "P7",
          reason: `Target ID '${targetId}' is not in declared scope list [${ctx.declaredScopeIds.join(", ")}].`,
        };
      }
    }
  }

  // P3: Refund amount ≤ remaining refundable amount of the referenced capture (pre-flight read)
  if (ctx.tool === "create_refund" && ctx.args.capture_id) {
    if (!ctx.captureLookup) {
      return {
        decision: "held",
        ruleId: "P3",
        reason: "Pre-flight capture reader unavailable. Held closed.",
      };
    }

    try {
      const captureData = await ctx.captureLookup(ctx.args.capture_id);
      if (!captureData) {
        return {
          decision: "held",
          ruleId: "P3",
          reason: `Pre-flight capture lookup failed for '${ctx.args.capture_id}'. Held closed.`,
        };
      }

      const remainingMinor = toMinorUnits(
        captureData.remainingRefundableAmount,
        captureData.currency || currency
      );

      if (amountMinor > remainingMinor) {
        return {
          decision: "blocked",
          ruleId: "P3",
          reason: `Refund amount (${rawAmount} ${currency}) exceeds remaining refundable capture balance of ${captureData.remainingRefundableAmount} ${currency}.`,
        };
      }
    } catch (err: any) {
      return {
        decision: "held",
        ruleId: "P3",
        reason: `Pre-flight read error: ${err.message}. Held closed.`,
      };
    }
  }

  // P6: Invoice recipient is in the merchant contact allow-list
  if (ctx.tool === "create_invoice") {
    const recipientEmail = extractByPath(ctx.args, registryEntry.targetPath);
    if (recipientEmail && config.allowedMerchantContacts.length > 0) {
      const isAllowed = config.allowedMerchantContacts.some(
        (c) => c.toLowerCase() === String(recipientEmail).toLowerCase()
      );
      if (!isAllowed) {
        return {
          decision: "held",
          ruleId: "P6",
          reason: `Invoice recipient '${recipientEmail}' is not in approved merchant contact allow-list. Held for approval.`,
        };
      }
    }
  }

  return {
    decision: "allow",
    ruleId: null,
    reason: "Deterministic money rules passed.",
  };
}
