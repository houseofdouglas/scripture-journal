// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiClient, ApiError } from "../api-client";
import { stubMemoryLocalStorage } from "./memory-storage";

const SESSION_KEYS = ["jwt", "jwt_expires_at", "jwt_username", "jwt_user_id"];
const originalLocation = window.location;
let location: { pathname: string; search: string; href: string };

function seedSession(): void {
  localStorage.setItem("jwt", "token-abc");
  localStorage.setItem("jwt_expires_at", "2999-01-01T00:00:00.000Z");
  localStorage.setItem("jwt_username", "peter");
  localStorage.setItem("jwt_user_id", "u1");
}

beforeEach(() => {
  stubMemoryLocalStorage();
  location = {
    pathname: "/scripture",
    search: "?q=1",
    href: "http://localhost/scripture?q=1",
  };
  // jsdom can't navigate — swap in a plain object so href assignments are observable
  Object.defineProperty(window, "location", {
    configurable: true,
    value: location,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: originalLocation,
  });
});

function respond(status: number, body: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json(body, { status })),
  );
}

describe("apiClient 401 handling", () => {
  it("401 on a request that sent a token clears the session and redirects with expired=1", async () => {
    seedSession();
    respond(401, { error: "UNAUTHORIZED" });

    // The returned promise never settles once navigation starts — don't await it
    void apiClient.get("/projects");
    await vi.waitFor(() => expect(location.href).toMatch(/^\/login\?/));

    const params = new URLSearchParams(location.href.split("?")[1]);
    expect(params.get("return")).toBe("/scripture?q=1");
    expect(params.get("expired")).toBe("1");
    for (const key of SESSION_KEYS)
      expect(localStorage.getItem(key)).toBeNull();
  });

  it("401 on a request sent without a token rejects with ApiError and does not redirect", async () => {
    respond(401, { error: "UNAUTHORIZED" });

    await expect(apiClient.get("/projects")).rejects.toMatchObject({
      status: 401,
    });
    await expect(apiClient.get("/projects")).rejects.toBeInstanceOf(ApiError);
    expect(location.href).toBe("http://localhost/scripture?q=1");
  });

  it("WRONG_CURRENT_PASSWORD 401 reaches the caller even with a token", async () => {
    seedSession();
    respond(401, { error: "WRONG_CURRENT_PASSWORD" });

    await expect(apiClient.post("/auth/password", {})).rejects.toMatchObject({
      status: 401,
    });
    expect(location.href).toBe("http://localhost/scripture?q=1");
    expect(localStorage.getItem("jwt")).toBe("token-abc");
  });

  it("sends the bearer token when one is stored", async () => {
    seedSession();
    respond(200, { ok: true });

    await apiClient.get("/projects");

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect((init?.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer token-abc",
    );
  });
});
