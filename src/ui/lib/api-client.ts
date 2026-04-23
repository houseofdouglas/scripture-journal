/**
 * Thin fetch wrapper that:
 * - Attaches `Authorization: Bearer <token>` from localStorage
 * - Parses JSON responses
 * - On 401, stores the current path in localStorage and redirects to /login
 */

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
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === 401) {
    // Store return path then redirect to login
    const returnPath = window.location.pathname + window.location.search;
    localStorage.removeItem("jwt");
    window.location.href = `/login?return=${encodeURIComponent(returnPath)}`;
    // Return a never-resolving promise — navigation is in progress
    return new Promise(() => {});
  }

  const json: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(response.status, json);
  }

  return json as T;
}

export const apiClient = {
  post: <T>(path: string, body: unknown) => request<T>("POST", path, body),
  get: <T>(path: string) => request<T>("GET", path),
};
