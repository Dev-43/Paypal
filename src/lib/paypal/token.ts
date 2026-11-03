/**
 * PayPal Sandbox OAuth2 Token Service
 * Enforces Safety Invariant 1 (PAYPAL_ENV === "sandbox")
 * Handles refresh at 60% lifetime and exactly one retry on 401.
 */

export class PaypalEnvError extends Error {
  constructor(message = "Safety Invariant Violation: PAYPAL_ENV must be 'sandbox'. Production credentials and environments are strictly forbidden.") {
    super(message);
    this.name = "PaypalEnvError";
  }
}

export function assertSandboxEnv(): void {
  const env = process.env.PAYPAL_ENV;
  if (env !== "sandbox") {
    throw new PaypalEnvError();
  }
}

interface CachedToken {
  accessToken: string;
  issuedAt: number;
  expiresInSeconds: number;
  refreshAt: number;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;
let tokenFetchPromise: Promise<string> | null = null;

export async function fetchSandboxToken(
  clientId = process.env.PAYPAL_CLIENT_ID,
  clientSecret = process.env.PAYPAL_CLIENT_SECRET
): Promise<CachedToken> {
  assertSandboxEnv();

  if (!clientId || !clientSecret) {
    throw new Error("Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET environment variables.");
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch("https://api-m.sandbox.paypal.com/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`PayPal OAuth token request failed (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  const now = Date.now();
  const expiresInSeconds = data.expires_in || 32400; // default 9 hours if unstated
  const lifetimeMs = expiresInSeconds * 1000;
  const refreshAt = now + Math.floor(lifetimeMs * 0.6); // 60% of lifetime
  const expiresAt = now + lifetimeMs;

  const newToken: CachedToken = {
    accessToken: data.access_token,
    issuedAt: now,
    expiresInSeconds,
    refreshAt,
    expiresAt,
  };

  cachedToken = newToken;
  return newToken;
}

export async function getValidAccessToken(forceRefresh = false): Promise<string> {
  assertSandboxEnv();

  const now = Date.now();
  if (!forceRefresh && cachedToken && now < cachedToken.refreshAt) {
    return cachedToken.accessToken;
  }

  // Deduplicate concurrent refresh calls
  if (tokenFetchPromise) {
    return tokenFetchPromise;
  }

  tokenFetchPromise = (async () => {
    try {
      const token = await fetchSandboxToken();
      return token.accessToken;
    } finally {
      tokenFetchPromise = null;
    }
  })();

  return tokenFetchPromise;
}

export function invalidateTokenForTesting(): void {
  cachedToken = null;
}

export function setExpiredTokenForTesting(): void {
  cachedToken = {
    accessToken: "deliberately_invalidated_token",
    issuedAt: Date.now(),
    expiresInSeconds: 3600,
    refreshAt: Date.now() + 1800 * 1000,
    expiresAt: Date.now() + 3600 * 1000,
  };
}

export function getTokenHealth(): {
  valid: boolean;
  remainingSeconds: number;
  expiresAt: string | null;
  error?: string;
} {
  try {
    assertSandboxEnv();
  } catch (err: any) {
    return {
      valid: false,
      remainingSeconds: 0,
      expiresAt: null,
      error: err.message,
    };
  }

  if (!cachedToken) {
    return {
      valid: false,
      remainingSeconds: 0,
      expiresAt: null,
      error: "No active token cached",
    };
  }

  const remainingMs = cachedToken.expiresAt - Date.now();
  const remainingSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const valid = remainingSeconds > 0;

  return {
    valid,
    remainingSeconds,
    expiresAt: new Date(cachedToken.expiresAt).toISOString(),
  };
}

export async function callWithTokenRetry<T>(
  apiCall: (token: string) => Promise<T>
): Promise<T> {
  assertSandboxEnv();
  let token = await getValidAccessToken();

  try {
    return await apiCall(token);
  } catch (error: any) {
    // If 401 Unauthorized, refresh token once and retry exactly once
    if (error?.status === 401 || error?.statusCode === 401 || error?.message?.includes("401")) {
      token = await getValidAccessToken(true);
      return await apiCall(token);
    }
    throw error;
  }
}
