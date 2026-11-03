/**
 * PayPal Tool Registry (Task 1.4)
 * Maps tools to their classification, money parameters, and untrusted field paths.
 * Tools absent from this registry are automatically BLOCKED at L0.
 */

export type ToolClass = "read" | "money_move" | "config";

export interface RegistryEntry {
  tool: string;
  class: ToolClass;
  amountPath?: string;
  currencyPath?: string;
  targetPath?: string;
  readBackTool?: string;
  untrustedFieldPaths: string[];
}

export const TOOL_REGISTRY: Record<string, RegistryEntry> = {
  // --- Read Tools (Orders, Invoices, Disputes, Refunds) ---
  get_order: {
    tool: "get_order",
    class: "read",
    untrustedFieldPaths: [
      "purchase_units.0.shipping.name.full_name",
      "purchase_units.0.shipping.address.address_line_1",
      "purchase_units.0.shipping.address.admin_area_2",
      "purchase_units.0.items.0.name",
      "purchase_units.0.description",
      "notes",
    ],
  },
  get_dispute: {
    tool: "get_dispute",
    class: "read",
    untrustedFieldPaths: [
      "messages",
      "buyer_response",
      "dispute_amount.value",
    ],
  },
  list_disputes: {
    tool: "list_disputes",
    class: "read",
    untrustedFieldPaths: [
      "items.0.messages",
      "items.0.dispute_amount",
    ],
  },
  get_refund: {
    tool: "get_refund",
    class: "read",
    untrustedFieldPaths: [
      "note_to_payer",
      "reason",
    ],
  },
  get_invoice: {
    tool: "get_invoice",
    class: "read",
    untrustedFieldPaths: [
      "detail.note",
      "detail.memo",
      "primary_recipients.0.billing_info.name.full_name",
    ],
  },
  list_invoices: {
    tool: "list_invoices",
    class: "read",
    untrustedFieldPaths: [
      "invoices.0.detail.note",
      "invoices.0.primary_recipients.0.billing_info.name.full_name",
    ],
  },

  // --- Money Moving Tools (Refunds, Captures, Invoices) ---
  create_refund: {
    tool: "create_refund",
    class: "money_move",
    amountPath: "amount.value",
    currencyPath: "amount.currency_code",
    targetPath: "capture_id",
    readBackTool: "get_refund",
    untrustedFieldPaths: [
      "note_to_payer",
    ],
  },
  pay_order: {
    tool: "pay_order",
    class: "money_move",
    amountPath: "amount.value",
    currencyPath: "amount.currency_code",
    targetPath: "id",
    readBackTool: "get_order",
    untrustedFieldPaths: [],
  },
  create_invoice: {
    tool: "create_invoice",
    class: "money_move",
    amountPath: "items.0.unit_amount.value",
    currencyPath: "currency_code",
    targetPath: "primary_recipients.0.billing_info.email_address",
    readBackTool: "get_invoice",
    untrustedFieldPaths: [
      "note",
      "primary_recipients.0.billing_info.name.full_name",
    ],
  },
};

/**
 * Check if a tool exists in the registry.
 * Layer 0 (L0) classifier.
 */
export function getRegistryEntry(toolName: string): RegistryEntry | null {
  return TOOL_REGISTRY[toolName] ?? null;
}

export function isToolAllowed(toolName: string): boolean {
  return Boolean(TOOL_REGISTRY[toolName]);
}
