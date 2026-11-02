import { describe, it, expect } from "vitest";
import { checkHardLimits } from "../src/lib/policy/hardLimits";
import { PermissionState, AgentAction } from "../src/contracts";

const baseState: PermissionState = {
  version: 1,
  grants: [
    { tool: "read_file", scope: "/finance/" },
    { tool: "read_file", scope: "/hr/" },
    { tool: "write_file", scope: "/finance/reports/" },
    { tool: "list_files", scope: "/" },
    { tool: "query_invoices", scope: "*" },
    { tool: "send_email", scope: "*" },
  ],
  disabledTools: [],
  approvalRequiredTools: [],
  frozen: false,
  sensitiveRead: false,
  restrictionLog: [],
};

const allowList = ["acme-finance.example", "acme-corp.example"];

describe("Deterministic Hard Limits H1-H6 (T6)", () => {
  it("H1: blocks when tool is in disabledTools", () => {
    const state: PermissionState = {
      ...baseState,
      disabledTools: ["write_file"],
    };
    const action: AgentAction = {
      runId: "r1",
      stepIndex: 1,
      tool: "write_file",
      args: { path: "/finance/reports/q3.csv", content: "data" },
      rationale: "saving report",
    };
    const res = checkHardLimits(action, state, allowList);
    expect(res.passed).toBe(false);
    expect(res.rule).toBe("H1");
    expect(res.outcome).toBe("blocked");
  });

  it("H1: blocks when no grant exists for the tool", () => {
    const state: PermissionState = {
      ...baseState,
      grants: [{ tool: "read_file", scope: "/finance/" }],
    };
    const action: AgentAction = {
      runId: "r1",
      stepIndex: 1,
      tool: "query_invoices",
      args: {},
      rationale: "querying invoices",
    };
    const res = checkHardLimits(action, state, allowList);
    expect(res.passed).toBe(false);
    expect(res.rule).toBe("H1");
    expect(res.outcome).toBe("blocked");
  });

  it("H2: blocks when file path is outside granted scopes", () => {
    const action: AgentAction = {
      runId: "r1",
      stepIndex: 1,
      tool: "read_file",
      args: { path: "/etc/passwd" },
      rationale: "checking system files",
    };
    const res = checkHardLimits(action, baseState, allowList);
    expect(res.passed).toBe(false);
    expect(res.rule).toBe("H2");
    expect(res.outcome).toBe("blocked");
  });

  it("H2: passes when file path is inside granted scopes", () => {
    const action: AgentAction = {
      runId: "r1",
      stepIndex: 1,
      tool: "read_file",
      args: { path: "/finance/invoices/INV-1001.txt" },
      rationale: "checking invoice",
    };
    const res = checkHardLimits(action, baseState, allowList);
    expect(res.passed).toBe(true);
  });

  it("H2: blocks when email domain is not covered by any grant", () => {
    const state: PermissionState = {
      ...baseState,
      grants: [{ tool: "send_email", scope: "acme-corp.example" }],
    };
    const action: AgentAction = {
      runId: "r1",
      stepIndex: 1,
      tool: "send_email",
      args: { to: "user@random.com", body: "hello" },
      rationale: "sending email",
    };
    const res = checkHardLimits(action, state, allowList);
    expect(res.passed).toBe(false);
    expect(res.rule).toBe("H2");
  });

  it("H3: holds for approval when email domain is not on allow-list, even if granted", () => {
    const action: AgentAction = {
      runId: "r1",
      stepIndex: 1,
      tool: "send_email",
      args: {
        to: "auditor@external-review.example",
        subject: "audit",
        body: "report",
      },
      rationale: "sending external report",
    };
    const res = checkHardLimits(action, baseState, allowList);
    expect(res.passed).toBe(false);
    expect(res.rule).toBe("H3");
    expect(res.outcome).toBe("held");
  });

  it("H4: holds when tool is in approvalRequiredTools", () => {
    const state: PermissionState = {
      ...baseState,
      approvalRequiredTools: ["read_file"],
    };
    const action: AgentAction = {
      runId: "r1",
      stepIndex: 1,
      tool: "read_file",
      args: { path: "/finance/invoices/INV-1001.txt" },
      rationale: "reading invoice",
    };
    const res = checkHardLimits(action, state, allowList);
    expect(res.passed).toBe(false);
    expect(res.rule).toBe("H4");
    expect(res.outcome).toBe("held");
  });

  it("H5: holds when send_email is called and sensitiveRead is true", () => {
    const state: PermissionState = {
      ...baseState,
      sensitiveRead: true,
    };
    const action: AgentAction = {
      runId: "r1",
      stepIndex: 1,
      tool: "send_email",
      args: {
        to: "manager@acme-corp.example",
        subject: "internal report",
        body: "summary",
      },
      rationale: "sending internal report",
    };
    const res = checkHardLimits(action, state, allowList);
    expect(res.passed).toBe(false);
    expect(res.rule).toBe("H5");
    expect(res.outcome).toBe("held");
  });

  it("H5: passes when send_email is called to allow-listed domain and sensitiveRead is false", () => {
    const state: PermissionState = {
      ...baseState,
      sensitiveRead: false,
    };
    const action: AgentAction = {
      runId: "r1",
      stepIndex: 1,
      tool: "send_email",
      args: {
        to: "manager@acme-corp.example",
        subject: "internal report",
        body: "summary",
      },
      rationale: "sending internal report",
    };
    const res = checkHardLimits(action, state, allowList);
    expect(res.passed).toBe(true);
  });

  it("H6: blocks when stepIndex >= 25", () => {
    const action: AgentAction = {
      runId: "r1",
      stepIndex: 25,
      tool: "read_file",
      args: { path: "/finance/invoices/INV-1001.txt" },
      rationale: "reading invoice",
    };
    const res = checkHardLimits(action, baseState, allowList);
    expect(res.passed).toBe(false);
    expect(res.rule).toBe("H6");
    expect(res.outcome).toBe("blocked");
  });
});
