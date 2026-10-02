/**
 * Thin fetch wrapper that:
 * - Attaches `Authorization: Bearer <token>` from localStorage
 * - Parses JSON responses
 * - On 401 for a request that carried a token, clears the stored session and
 *   redirects to /login?return=<path>&expired=1. A 401 on a request sent
 *   without a token is not an expired session — it surfaces as an ApiError.
 */

import { clearStoredSession, loginUrl } from "./auth-context";

const BASE = "/api";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown
  ) {
    super(`API error ${status}`);
    this.name = "ApiError";
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const token = localStorage.getItem("jwt");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : null,
  });

  const json: unknown = await response.json().catch(() => null);

  // 401 usually means the JWT expired/is invalid, but some endpoints (e.g.
  // POST /auth/password) also use 401 for a domain-specific error — those
  // carry their own error code and must reach the caller as an ApiError
  // instead of forcing a session-expired redirect (annotation spec / auth spec).
  // A 401 without a token means there was never a session to expire, so it
  // falls through to the ApiError below (auth spec FR-11a).
  const isSessionExpired =
    token !== null &&
    response.status === 401 &&
    (json as { error?: string } | null)?.error !== "WRONG_CURRENT_PASSWORD";

  if (isSessionExpired) {
    const returnPath = window.location.pathname + window.location.search;
    clearStoredSession();
    window.location.href = loginUrl(returnPath, { expired: true });
    // Return a never-resolving promise — navigation is in progress
    return new Promise(() => {});
  }

  if (!response.ok) {
    throw new ApiError(response.status, json);
  }

  return json as T;
}

export const apiClient = {
  post: <T>(path: string, body: unknown) => request<T>("POST", path, body),
  get: <T>(path: string) => request<T>("GET", path),
};
