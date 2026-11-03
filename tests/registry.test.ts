import { describe, it, expect } from "vitest";
import { TOOL_REGISTRY, getRegistryEntry, isToolAllowed } from "../src/lib/paypal/registry";

describe("PayPal Tool Registry (Task 1.4)", () => {
  it("blocks tools absent from the registry at L0", () => {
    expect(isToolAllowed("delete_invoice")).toBe(false);
    expect(isToolAllowed("cancel_subscription")).toBe(false);
    expect(isToolAllowed("unknown_custom_tool")).toBe(false);
    expect(getRegistryEntry("delete_invoice")).toBeNull();
  });

  it("permits allowed read tools for orders, disputes, invoices, and refunds", () => {
    const expectedReads = ["get_order", "get_dispute", "list_disputes", "get_refund", "get_invoice", "list_invoices"];
    for (const tool of expectedReads) {
      const entry = getRegistryEntry(tool);
      expect(entry).not.toBeNull();
      expect(entry?.class).toBe("read");
      expect(entry?.untrustedFieldPaths.length).toBeGreaterThan(0);
    }
  });

  it("ensures each money_move entry specifies amountPath, currencyPath, targetPath, and readBackTool", () => {
    const moneyMoveTools = Object.values(TOOL_REGISTRY).filter((e) => e.class === "money_move");
    expect(moneyMoveTools.length).toBeGreaterThanOrEqual(3);

    for (const entry of moneyMoveTools) {
      expect(entry.targetPath).toBeDefined();
      expect(entry.readBackTool).toBeDefined();
      expect(TOOL_REGISTRY[entry.readBackTool!]).toBeDefined();
      expect(TOOL_REGISTRY[entry.readBackTool!].class).toBe("read");

      if (entry.tool === "create_refund" || entry.tool === "create_invoice") {
        expect(entry.amountPath).toBeDefined();
        expect(entry.currencyPath).toBeDefined();
      }
    }
  });
});
