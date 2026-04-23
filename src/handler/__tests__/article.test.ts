import { describe, it, expect, vi, beforeEach } from "vitest";


vi.mock("../../service/auth", () => ({
  verifyToken: vi.fn(),
  isAdmin: vi.fn(),
}));

vi.mock("../../service/article-import", () => ({
  importArticle: vi.fn(),
}));

import * as authService from "../../service/auth";
import * as articleService from "../../service/article-import";
import { ValidationError } from "../../service/errors";
import { createApp } from "../app";
import { registerArticleRoutes } from "../article";

const mockVerifyToken = vi.mocked(authService.verifyToken);
const mockImportArticle = vi.mocked(articleService.importArticle);

const FAKE_PAYLOAD = { sub: "user-uuid", username: "peter", iat: 1000000, exp: 9999999 };

function buildApp() {
  const app = createApp();
  registerArticleRoutes(app);
  return app;
}

async function req(app: ReturnType<typeof buildApp>, body?: unknown, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  return app.request("/articles/import", {
    method: "POST",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("POST /articles/import", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 without JWT", async () => {
    const app = buildApp();
    const res = await req(app, { url: "https://www.churchofjesuschrist.org/study/test" });
    expect(res.status).toBe(401);
  });

  it("returns 200 IMPORTED on successful import", async () => {
    mockVerifyToken.mockResolvedValue(FAKE_PAYLOAD);
    mockImportArticle.mockResolvedValue({
      status: "IMPORTED",
      articleId: "a".repeat(64),
      title: "Test Article",
      importedAt: "2026-04-22T10:00:00Z",
    });

    const app = buildApp();
    const res = await req(
      app,
      { url: "https://www.churchofjesuschrist.org/study/test" },
      "valid-token"
    );

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.status).toBe("IMPORTED");
  });

  it("returns 422 DOMAIN_NOT_ALLOWED for disallowed URL", async () => {
    mockVerifyToken.mockResolvedValue(FAKE_PAYLOAD);
    mockImportArticle.mockRejectedValue(
      new ValidationError({ url: 'Domain "example.com" is not on the allowlist.' })
    );

    const app = buildApp();
    const res = await req(
      app,
      { url: "https://example.com/article" },
      "valid-token"
    );

    expect(res.status).toBe(422);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe("DOMAIN_NOT_ALLOWED");
  });

  it("returns 422 FETCH_FAILED on timeout", async () => {
    mockVerifyToken.mockResolvedValue(FAKE_PAYLOAD);
    mockImportArticle.mockRejectedValue(
      new ValidationError({ url: "Request timed out after 10 seconds." })
    );

    const app = buildApp();
    const res = await req(
      app,
      { url: "https://www.churchofjesuschrist.org/study/test" },
      "valid-token"
    );

    expect(res.status).toBe(422);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe("FETCH_FAILED");
  });

  it("returns 200 DUPLICATE shape", async () => {
    mockVerifyToken.mockResolvedValue(FAKE_PAYLOAD);
    mockImportArticle.mockResolvedValue({
      status: "DUPLICATE",
      articleId: "b".repeat(64),
      title: "Dup Article",
      importedAt: "2026-01-01T00:00:00Z",
    });

    const app = buildApp();
    const res = await req(
      app,
      { url: "https://www.churchofjesuschrist.org/study/test" },
      "valid-token"
    );

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.status).toBe("DUPLICATE");
  });

  it("returns 200 NEW_VERSION shape", async () => {
    mockVerifyToken.mockResolvedValue(FAKE_PAYLOAD);
    mockImportArticle.mockResolvedValue({
      status: "NEW_VERSION",
      previousArticleId: "c".repeat(64),
      previousImportedAt: "2026-01-01T00:00:00Z",
      title: "Updated Article",
    });

    const app = buildApp();
    const res = await req(
      app,
      { url: "https://www.churchofjesuschrist.org/study/test" },
      "valid-token"
    );

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.status).toBe("NEW_VERSION");
  });

  it("returns 422 on Zod validation failure (missing url)", async () => {
    mockVerifyToken.mockResolvedValue(FAKE_PAYLOAD);

    const app = buildApp();
    const res = await req(app, { notAUrl: "something" }, "valid-token");

    expect(res.status).toBe(422);
  });
});
