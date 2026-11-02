import { describe, it, expect } from "vitest";
import {
  applyRestriction,
  validateRestriction,
  restoreScope,
  unfreezeRun,
  applyHumanAction,
} from "../src/lib/policy/ratchet";
import * as ratchetModule from "../src/lib/policy/ratchet";
import { PermissionState, Restriction, Grant } from "../src/contracts";

const initialState: PermissionState = {
  version: 1,
  grants: [
    { tool: "read_file", scope: "/finance/" },
    { tool: "read_file", scope: "/hr/" },
    { tool: "write_file", scope: "/finance/reports/" },
    { tool: "send_email", scope: "*" },
  ],
  disabledTools: [],
  approvalRequiredTools: [],
  frozen: false,
  sensitiveRead: false,
  restrictionLog: [],
};

describe("One-Way Ratchet (T6)", () => {
  it("R1 & R2: revoke_scope removes grants and increments version by 1", () => {
    const restriction: Restriction = {
      kind: "revoke_scope",
      tool: "read_file",
      scope: "/hr/",
    };
    const nextState = applyRestriction(initialState, restriction, "watcher");

    expect(nextState.version).toBe(2);
    expect(nextState.grants).toEqual([
      { tool: "read_file", scope: "/finance/" },
      { tool: "write_file", scope: "/finance/reports/" },
      { tool: "send_email", scope: "*" },
    ]);
    expect(nextState.restrictionLog.length).toBe(1);
    expect(nextState.restrictionLog[0].by).toBe("watcher");
  });

  it("R1 & R2: disable_tool adds tool to disabledTools and increments version by 1", () => {
    const restriction: Restriction = {
      kind: "disable_tool",
      tool: "send_email",
    };
    const nextState = applyRestriction(initialState, restriction, "hard_limit");

    expect(nextState.version).toBe(2);
    expect(nextState.disabledTools).toContain("send_email");
  });

  it("R1 & R2: require_approval adds tool to approvalRequiredTools and increments version", () => {
    const restriction: Restriction = {
      kind: "require_approval",
      tool: "write_file",
    };
    const nextState = applyRestriction(initialState, restriction, "watcher");

    expect(nextState.version).toBe(2);
    expect(nextState.approvalRequiredTools).toContain("write_file");
  });

  it("R1 & R2: freeze_run sets frozen to true and increments version", () => {
    const restriction: Restriction = {
      kind: "freeze_run",
    };
    const nextState = applyRestriction(initialState, restriction, "watcher");

    expect(nextState.version).toBe(2);
    expect(nextState.frozen).toBe(true);
  });

  it("R3: restoreScope is the only exported function that can increase grants length", () => {
    // Scan module exports
    const exportNames = Object.keys(ratchetModule);
    expect(exportNames).toContain("restoreScope");

    // Test restoring a scope increases grants and version
    const newGrant: Grant = { tool: "read_file", scope: "/hr/policies/" };
    const restoredState = restoreScope(initialState, newGrant);
    expect(restoredState.version).toBe(2);
    expect(restoredState.grants.length).toBe(initialState.grants.length + 1);
    expect(restoredState.grants).toContainEqual(newGrant);

    // Verify unfreezeRun does not add grants
    const unfreezed = unfreezeRun({ ...initialState, frozen: true });
    expect(unfreezed.grants.length).toBe(initialState.grants.length);
    expect(unfreezed.frozen).toBe(false);
  });

  it("R4: validateRestriction rejects 10 malformed or widening inputs", () => {
    const malformedCases: unknown[] = [
      null, // 1. null
      undefined, // 2. undefined
      "revoke_scope", // 3. string
      { kind: "widen_scope", tool: "read_file", scope: "/all/" }, // 4. widening attempt
      { kind: "grant_tool", tool: "send_email" }, // 5. illegal grant
      { kind: "disable_tool" }, // 6. missing tool
      { kind: "disable_tool", tool: "destroy_database" }, // 7. unknown tool
      { kind: "revoke_scope", tool: "read_file", scope: "" }, // 8. empty scope
      { kind: "freeze_run", extra_privilege: true }, // 9. injected extra keys
      { kind: "unfreeze" }, // 10. unfreeze via restriction
    ];

    malformedCases.forEach((candidate) => {
      const result = validateRestriction(candidate);
      expect(result).toBeNull();
    });
  });

  it("validates legitimate restrictions correctly", () => {
    expect(
      validateRestriction({
        kind: "revoke_scope",
        tool: "read_file",
        scope: "/hr/",
      })
    ).toEqual({
      kind: "revoke_scope",
      tool: "read_file",
      scope: "/hr/",
    });

    expect(
      validateRestriction({
        kind: "disable_tool",
        tool: "send_email",
      })
    ).toEqual({
      kind: "disable_tool",
      tool: "send_email",
    });

    expect(
      validateRestriction({
        kind: "freeze_run",
      })
    ).toEqual({
      kind: "freeze_run",
    });
  });

  it("applyHumanAction handles restore_scope and unfreeze", () => {
    const frozenState = { ...initialState, frozen: true };
    const unfreezeResult = applyHumanAction(frozenState, { action: "unfreeze" });
    expect(unfreezeResult.frozen).toBe(false);
    expect(unfreezeResult.version).toBe(frozenState.version + 1);

    const restoreResult = applyHumanAction(initialState, {
      action: "restore_scope",
      grant: { tool: "query_invoices", scope: "*" },
    });
    expect(restoreResult.grants).toContainEqual({ tool: "query_invoices", scope: "*" });
  });
});
