import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  assertSandboxEnv,
  PaypalEnvError,
  callWithTokenRetry,
  getTokenHealth,
  setExpiredTokenForTesting,
  invalidateTokenForTesting,
  getValidAccessToken,
} from "../src/lib/paypal/token";

describe("PayPal Sandbox Token Service (Task 1.3)", () => {
  const originalEnv = process.env.PAYPAL_ENV;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.PAYPAL_ENV = "sandbox";
    process.env.PAYPAL_CLIENT_ID = "mock_client_id";
    process.env.PAYPAL_CLIENT_SECRET = "mock_client_secret";
    invalidateTokenForTesting();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env.PAYPAL_ENV = originalEnv;
    globalThis.fetch = originalFetch;
  });

  it("refuses to run if PAYPAL_ENV is not 'sandbox' (Safety Invariant 1)", () => {
    process.env.PAYPAL_ENV = "production";
    expect(() => assertSandboxEnv()).toThrow(PaypalEnvError);

    delete process.env.PAYPAL_ENV;
    expect(() => assertSandboxEnv()).toThrow(PaypalEnvError);

    process.env.PAYPAL_ENV = "live";
    expect(() => assertSandboxEnv()).toThrow(PaypalEnvError);

    process.env.PAYPAL_ENV = "sandbox";
    expect(() => assertSandboxEnv()).not.toThrow();
  });

  it("recovers on its own when token is deliberately invalidated (401 error)", async () => {
    let callCount = 0;
    let fetchCount = 0;

    // Mock global fetch for OAuth endpoint
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      fetchCount++;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          access_token: `valid_refreshed_token_${fetchCount}`,
          expires_in: 3600,
        }),
      } as any;
    });

    setExpiredTokenForTesting();

    const result = await callWithTokenRetry(async (token) => {
      callCount++;
      if (token === "deliberately_invalidated_token") {
        const err: any = new Error("Request failed with status code 401");
        err.status = 401;
        throw err;
      }
      return { success: true, tokenUsed: token };
    });

    expect(result.success).toBe(true);
    expect(result.tokenUsed).toContain("valid_refreshed_token");
    expect(callCount).toBe(2); // First call failed with 401, second retry succeeded
  });

  it("proves exactly one retry only on consecutive 401s", async () => {
    let callCount = 0;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: "refreshed_token",
        expires_in: 3600,
      }),
    } as any);

    await expect(
      callWithTokenRetry(async () => {
        callCount++;
        const err: any = new Error("Persistent 401");
        err.status = 401;
        throw err;
      })
    ).rejects.toThrow("Persistent 401");

    // Proves exactly one retry: initial attempt + 1 retry = 2 total
    expect(callCount).toBe(2);
  });

  it("reports token health correctly", async () => {
    invalidateTokenForTesting();
    expect(getTokenHealth().valid).toBe(false);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: "healthy_token",
        expires_in: 3600,
      }),
    } as any);

    await getValidAccessToken();
    const health = getTokenHealth();

    expect(health.valid).toBe(true);
    expect(health.remainingSeconds).toBeGreaterThan(3500);
    expect(health.expiresAt).toBeDefined();
  });
});
