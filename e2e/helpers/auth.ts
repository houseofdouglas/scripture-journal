import { Page } from "@playwright/test";

/** Base64url-encode a string (no padding). */
function b64url(str: string): string {
  return Buffer.from(str)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Build a plausible (but unsigned) JWT string. */
function buildJwt(payload: Record<string, unknown>): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  return `${header}.${body}.fakesig`;
}

export interface AuthOverrides {
  sub?: string;
  username?: string;
  userId?: string;
  iat?: number;
  exp?: number;
  expiresAt?: number; // unix seconds — defaults to exp
}

/**
 * Seeds localStorage so the app thinks the user is logged in.
 * Call this inside page.evaluate — before navigating to a protected route.
 */
export async function seedAuth(
  page: Page,
  overrides: AuthOverrides = {},
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const sub = overrides.sub ?? "00000000-0000-0000-0000-000000000001";
  const username = overrides.username ?? "peter";
  const userId = overrides.userId ?? sub;
  const iat = overrides.iat ?? now;
  const exp = overrides.exp ?? now + 86400;
  const expiresAt = overrides.expiresAt ?? exp;

  const jwt = buildJwt({ sub, username, iat, exp });

  // auth-context uses new Date(expiresAt) — must be an ISO string
  const expiresAtIso = new Date(expiresAt * 1000).toISOString();

  await page.evaluate(
    ([token, expires, uname, uid]) => {
      localStorage.setItem("jwt", token);
      localStorage.setItem("jwt_expires_at", expires);
      localStorage.setItem("jwt_username", uname);
      localStorage.setItem("jwt_user_id", uid);
    },
    [jwt, expiresAtIso, username, userId] as const,
  );
}

/**
 * Seeds an expired JWT so auth-context clears it on mount.
 */
export async function seedExpiredAuth(page: Page): Promise<void> {
  const past = Math.floor(Date.now() / 1000) - 3600; // expired 1 hour ago
  await seedAuth(page, { iat: past - 86400, exp: past, expiresAt: past });
}
