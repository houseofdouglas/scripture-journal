import { describe, it, expect, vi, beforeEach } from "vitest";


vi.mock("../../service/auth", () => ({
  verifyToken: vi.fn(),
  isAdmin: vi.fn(),
}));

vi.mock("../../service/article-import", () => ({
  importArticle: vi.fn(),
  archiveArticle: vi.fn(),
  unarchiveArticle: vi.fn(),
}));

vi.mock("../../service/pdf-extract", () => ({
  extractPdf: vi.fn(),
}));

vi.mock("../../repository/tmp-upload", () => ({
  createExtractUploadUrl: vi.fn(),
}));

import * as authService from "../../service/auth";
import * as articleService from "../../service/article-import";
import * as pdfExtractService from "../../service/pdf-extract";
import * as tmpUploadRepo from "../../repository/tmp-upload";
import { ValidationError } from "../../service/errors";
import { WriteConflictError, ExtractionFailedError, ExtractionTimeoutError } from "../../repository/errors";
import { createApp } from "../app";
import { registerArticleRoutes } from "../article";

const mockVerifyToken = vi.mocked(authService.verifyToken);
const mockImportArticle = vi.mocked(articleService.importArticle);
const mockArchiveArticle = vi.mocked(articleService.archiveArticle);
const mockUnarchiveArticle = vi.mocked(articleService.unarchiveArticle);
const mockExtractPdf = vi.mocked(pdfExtractService.extractPdf);
const mockCreateExtractUploadUrl = vi.mocked(tmpUploadRepo.createExtractUploadUrl);

const FAKE_PAYLOAD = { sub: "user-uuid", username: "peter", iat: 1000000, exp: 9999999 };

function buildApp() {
  const app = createApp();
  registerArticleRoutes(app);
  return app;
}

async function req(app: ReturnType<typeof buildApp>, body?: unknown, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  return app.request("/api/articles/import", {
    method: "POST",
    headers,
    body: body ? JSON.stringify(body) : (undefined as any),
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

  it("returns 200 IMPORTED for PDF mode (no url)", async () => {
    mockVerifyToken.mockResolvedValue(FAKE_PAYLOAD);
    mockImportArticle.mockResolvedValue({
      status: "IMPORTED",
      articleId: "f".repeat(64),
      title: "My PDF Article",
      importedAt: "2026-05-01T10:00:00Z",
    });

    const app = buildApp();
    const res = await req(
      app,
      { text: "Paragraph one.\n\nParagraph two.", title: "My PDF Article" },
      "valid-token"
    );

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.status).toBe("IMPORTED");
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

const ARTICLE_ID = "a".repeat(64);

async function archiveReq(app: ReturnType<typeof buildApp>, action: "archive" | "unarchive", token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return app.request(`/api/articles/${ARTICLE_ID}/${action}`, { method: "POST", headers });
}

describe("POST /articles/:articleId/archive", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 without JWT", async () => {
    const app = buildApp();
    const res = await archiveReq(app, "archive");
    expect(res.status).toBe(401);
  });

  it("returns 200 with { data: { articleId, archived: true } } on success", async () => {
    mockVerifyToken.mockResolvedValue(FAKE_PAYLOAD);
    mockArchiveArticle.mockResolvedValue({ articleId: ARTICLE_ID, archived: true });

    const app = buildApp();
    const res = await archiveReq(app, "archive", "valid-token");

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { articleId: string; archived: boolean } };
    expect(body.data).toEqual({ articleId: ARTICLE_ID, archived: true });
  });

  it("returns 404 NOT_FOUND when the article has no matching index entry", async () => {
    mockVerifyToken.mockResolvedValue(FAKE_PAYLOAD);
    mockArchiveArticle.mockResolvedValue(null);

    const app = buildApp();
    const res = await archiveReq(app, "archive", "valid-token");

    expect(res.status).toBe(404);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("NOT_FOUND");
  });

  it("returns 409 WRITE_CONFLICT on persistent index write conflict", async () => {
    mockVerifyToken.mockResolvedValue(FAKE_PAYLOAD);
    mockArchiveArticle.mockRejectedValue(new WriteConflictError("content/articles/index.json"));

    const app = buildApp();
    const res = await archiveReq(app, "archive", "valid-token");

    expect(res.status).toBe(409);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("WRITE_CONFLICT");
  });
});

describe("POST /articles/:articleId/unarchive", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 without JWT", async () => {
    const app = buildApp();
    const res = await archiveReq(app, "unarchive");
    expect(res.status).toBe(401);
  });

  it("returns 200 with { data: { articleId, archived: false } } on success", async () => {
    mockVerifyToken.mockResolvedValue(FAKE_PAYLOAD);
    mockUnarchiveArticle.mockResolvedValue({ articleId: ARTICLE_ID, archived: false });

    const app = buildApp();
    const res = await archiveReq(app, "unarchive", "valid-token");

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { articleId: string; archived: boolean } };
    expect(body.data).toEqual({ articleId: ARTICLE_ID, archived: false });
  });

  it("returns 404 NOT_FOUND when the article has no matching index entry", async () => {
    mockVerifyToken.mockResolvedValue(FAKE_PAYLOAD);
    mockUnarchiveArticle.mockResolvedValue(null);

    const app = buildApp();
    const res = await archiveReq(app, "unarchive", "valid-token");

    expect(res.status).toBe(404);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("NOT_FOUND");
  });

  it("returns 409 WRITE_CONFLICT on persistent index write conflict", async () => {
    mockVerifyToken.mockResolvedValue(FAKE_PAYLOAD);
    mockUnarchiveArticle.mockRejectedValue(new WriteConflictError("content/articles/index.json"));

    const app = buildApp();
    const res = await archiveReq(app, "unarchive", "valid-token");

    expect(res.status).toBe(409);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("WRITE_CONFLICT");
  });
});

const VALID_KEY = "tmp/extract/550e8400-e29b-41d4-a716-446655440000.pdf";

async function uploadUrlReq(app: ReturnType<typeof buildApp>, token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return app.request("/api/articles/extract-pdf/upload-url", { method: "POST", headers });
}

describe("POST /articles/extract-pdf/upload-url", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 without JWT", async () => {
    const app = buildApp();
    const res = await uploadUrlReq(app);
    expect(res.status).toBe(401);
  });

  it("returns 200 with an uploadUrl and key", async () => {
    mockVerifyToken.mockResolvedValue(FAKE_PAYLOAD);
    mockCreateExtractUploadUrl.mockResolvedValue({ uploadUrl: "https://example.com/signed", key: VALID_KEY });

    const app = buildApp();
    const res = await uploadUrlReq(app, "valid-token");

    expect(res.status).toBe(200);
    const body = (await res.json()) as { uploadUrl: string; key: string };
    expect(body).toEqual({ uploadUrl: "https://example.com/signed", key: VALID_KEY });
  });
});

async function extractReq(app: ReturnType<typeof buildApp>, body?: unknown, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return app.request("/api/articles/extract-pdf", {
    method: "POST",
    headers,
    body: body ? JSON.stringify(body) : (undefined as any),
  });
}

describe("POST /articles/extract-pdf", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 without JWT", async () => {
    const app = buildApp();
    const res = await extractReq(app, { key: VALID_KEY, filename: "a.pdf" });
    expect(res.status).toBe(401);
  });

  it("returns 200 with paragraphs, suggestedTitle, and pageCount on success", async () => {
    mockVerifyToken.mockResolvedValue(FAKE_PAYLOAD);
    mockExtractPdf.mockResolvedValue({
      paragraphs: ["First paragraph.", "Second paragraph."],
      suggestedTitle: "My Article",
      pageCount: 3,
    });

    const app = buildApp();
    const res = await extractReq(app, { key: VALID_KEY, filename: "a.pdf" }, "valid-token");

    expect(res.status).toBe(200);
    const body = (await res.json()) as { paragraphs: string[]; suggestedTitle: string | null; pageCount: number };
    expect(body.paragraphs).toHaveLength(2);
    expect(body.suggestedTitle).toBe("My Article");
    expect(body.pageCount).toBe(3);
    expect(mockExtractPdf).toHaveBeenCalledWith(VALID_KEY);
  });

  it("returns 422 for a key outside tmp/extract/", async () => {
    mockVerifyToken.mockResolvedValue(FAKE_PAYLOAD);

    const app = buildApp();
    const res = await extractReq(app, { key: "content/articles/index.json", filename: "a.pdf" }, "valid-token");

    expect(res.status).toBe(422);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("VALIDATION_ERROR");
    expect(mockExtractPdf).not.toHaveBeenCalled();
  });

  it("returns 422 when the service throws ValidationError (missing/oversized/non-PDF)", async () => {
    mockVerifyToken.mockResolvedValue(FAKE_PAYLOAD);
    mockExtractPdf.mockRejectedValue(new ValidationError({ key: "PDF exceeds the 50 MB limit" }));

    const app = buildApp();
    const res = await extractReq(app, { key: VALID_KEY, filename: "a.pdf" }, "valid-token");

    expect(res.status).toBe(422);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("VALIDATION_ERROR");
    expect(body.message).toBe("PDF exceeds the 50 MB limit");
  });

  it("returns 502 EXTRACTION_FAILED when the Textract job fails", async () => {
    mockVerifyToken.mockResolvedValue(FAKE_PAYLOAD);
    mockExtractPdf.mockRejectedValue(new ExtractionFailedError("No text found in this PDF"));

    const app = buildApp();
    const res = await extractReq(app, { key: VALID_KEY, filename: "a.pdf" }, "valid-token");

    expect(res.status).toBe(502);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("EXTRACTION_FAILED");
  });

  it("returns 502 EXTRACTION_FAILED when the Textract job times out", async () => {
    mockVerifyToken.mockResolvedValue(FAKE_PAYLOAD);
    mockExtractPdf.mockRejectedValue(new ExtractionTimeoutError("job-1", 75_000));

    const app = buildApp();
    const res = await extractReq(app, { key: VALID_KEY, filename: "a.pdf" }, "valid-token");

    expect(res.status).toBe(502);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("EXTRACTION_FAILED");
  });
});
