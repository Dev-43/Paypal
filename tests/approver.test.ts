import { describe, it, expect, beforeEach } from "vitest";
import {
  verifyApproverPasscode,
  createApproverToken,
  verifyApproverToken,
} from "../src/lib/auth/approver";

describe("Approver Auth (T12)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      APPROVER_PASSCODE: "super-secret-passcode-2026",
      SESSION_SECRET: "99e12345678901234567890123456789",
    };
  });

  it("verifies matching passcode in constant time", () => {
    expect(verifyApproverPasscode("super-secret-passcode-2026")).toBe(true);
    expect(verifyApproverPasscode("wrong-passcode")).toBe(false);
    expect(verifyApproverPasscode("")).toBe(false);
  });

  it("creates valid signed HMAC tokens that verify cleanly", () => {
    const token = createApproverToken();
    expect(token).toBeDefined();
    expect(token).toContain(".");
    expect(verifyApproverToken(token)).toBe(true);
  });

  it("rejects tampered tokens or forged signatures", () => {
    const token = createApproverToken();
    const [payload, sig] = token.split(".");

    // Alter payload
    const tamperedToken = `${payload}x.${sig}`;
    expect(verifyApproverToken(tamperedToken)).toBe(false);

    // Alter signature
    const badSigToken = `${payload}.${sig.slice(0, -3)}abc`;
    expect(verifyApproverToken(badSigToken)).toBe(false);

    // Garbage token
    expect(verifyApproverToken("not.a.valid.token")).toBe(false);
    expect(verifyApproverToken("")).toBe(false);
  });
});
