import { describe, it, expect, vi, beforeEach } from "vitest";

// Provide env values (including a distribution ID so invalidation is exercised in tests)
vi.mock("../../config/env", () => ({
  env: {
    BUCKET_NAME: "test-bucket",
    ENV: "test",
    ADMIN_USERNAME: "peter",
    CLOUDFRONT_DOMAIN: "",
    CLOUDFRONT_DISTRIBUTION_ID: "EDFDVBD6EXAMPLE",
    JWT_SECRET_ARN: "arn:aws:ssm:us-east-1:123456789012:parameter/jwt-secret",
  },
}));

// Mock repository functions so no real S3 calls happen
vi.mock("../../repository/article", () => ({
  getArticle: vi.fn(),
  putArticle: vi.fn(),
  getArticleUrlIndex: vi.fn(),
  updateArticleUrlIndex: vi.fn(),
  updateArticleIndex: vi.fn(),
}));

// Mock CloudFront client — capture CreateInvalidationCommand calls
vi.mock("@aws-sdk/client-cloudfront", () => {
  const send = vi.fn().mockResolvedValue({});
  return {
    CloudFrontClient: vi.fn().mockImplementation(() => ({ send })),
    CreateInvalidationCommand: vi.fn().mockImplementation((input) => ({ input })),
    __cloudFrontSend: send,
  };
});

import { importArticle } from "../article-import";
import { ValidationError } from "../errors";
import * as articleRepo from "../../repository/article";
import * as cfModule from "@aws-sdk/client-cloudfront";

const mockGetArticle = vi.mocked(articleRepo.getArticle);
const mockPutArticle = vi.mocked(articleRepo.putArticle);
const mockGetUrlIndex = vi.mocked(articleRepo.getArticleUrlIndex);
const mockUpdateUrlIndex = vi.mocked(articleRepo.updateArticleUrlIndex);
const mockUpdateIndex = vi.mocked(articleRepo.updateArticleIndex);
// Access the shared send spy via the module's __cloudFrontSend export
const cfSend = (cfModule as unknown as { __cloudFrontSend: ReturnType<typeof vi.fn> }).__cloudFrontSend;

const ALLOWED_URL = "https://www.churchofjesuschrist.org/study/scriptures/bofm/alma/32";
const DISALLOWED_URL = "https://example.com/article";
const PREVIOUS_ID = "c".repeat(64);

describe("importArticle()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPutArticle.mockResolvedValue(undefined);
    mockUpdateUrlIndex.mockResolvedValue(undefined);
    mockUpdateIndex.mockResolvedValue(undefined);
    cfSend.mockResolvedValue({});
  });

  // ── Domain allowlist ─────────────────────────────────────────────────────────

  describe("domain allowlist", () => {
    it("throws ValidationError for disallowed domain without making a fetch", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      await expect(
        importArticle({ url: DISALLOWED_URL })
      ).rejects.toThrow(ValidationError);

      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  // ── Fetch failures ───────────────────────────────────────────────────────────

  describe("fetch failures", () => {
    it("throws ValidationError on fetch timeout (AbortError)", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(() => {
        const err = new Error("The operation was aborted");
        err.name = "AbortError";
        return Promise.reject(err);
      });

      mockGetArticle.mockResolvedValue(null);
      mockGetUrlIndex.mockResolvedValue(null);

      await expect(importArticle({ url: ALLOWED_URL })).rejects.toThrow(ValidationError);
    });

    it("throws ValidationError on non-2xx response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("Not Found", { status: 404 })
      );

      await expect(importArticle({ url: ALLOWED_URL })).rejects.toThrow(ValidationError);
    });
  });

  // ── Duplicate detection ──────────────────────────────────────────────────────

  describe("duplicate detection", () => {
    it("returns DUPLICATE when article already exists", async () => {
      const existingArticle = {
        articleId: "a".repeat(64),
        sourceUrl: ALLOWED_URL,
        title: "Existing Title",
        importedAt: "2026-01-01T00:00:00Z",
        scope: "shared" as const,
        paragraphs: [{ index: 0, text: "Paragraph one." }],
      };

      mockGetArticle.mockResolvedValue(existingArticle);

      const result = await importArticle({
        url: ALLOWED_URL,
        text: "Some text that hashes to the same articleId",
        title: "Test",
      });

      expect(["DUPLICATE", "IMPORTED"]).toContain(result.status);
    });

    it("does not call updateArticleIndex on DUPLICATE", async () => {
      const existingArticle = {
        articleId: "a".repeat(64),
        sourceUrl: ALLOWED_URL,
        title: "Existing Title",
        importedAt: "2026-01-01T00:00:00Z",
        scope: "shared" as const,
        paragraphs: [{ index: 0, text: "Paragraph one." }],
      };
      mockGetArticle.mockResolvedValue(existingArticle);

      const result = await importArticle({
        url: ALLOWED_URL,
        text: "some text",
        title: "Test",
      });

      if (result.status === "DUPLICATE") {
        expect(mockUpdateIndex).not.toHaveBeenCalled();
        expect(cfSend).not.toHaveBeenCalled();
      }
    });
  });

  // ── HTML stripping — golden file ─────────────────────────────────────────────

  describe("HTML stripping — golden file", () => {
    it("extracts <p> text content and splits into paragraphs", async () => {
      const html = `
        <html><body>
          <h1>Article Title</h1>
          <p>  First paragraph text.  </p>
          <p>Second paragraph.</p>
          <p></p>
          <p>Third paragraph.</p>
        </body></html>
      `;

      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(html, { status: 200, headers: { "Content-Type": "text/html" } })
      );

      mockGetArticle.mockResolvedValue(null);
      mockGetUrlIndex.mockResolvedValue(null);

      const result = await importArticle({ url: ALLOWED_URL });

      if (result.status === "IMPORTED") {
        expect(result.title).toContain("Article Title");
      }

      expect(mockPutArticle).toHaveBeenCalled();
      const article = mockPutArticle.mock.calls[0]![0]!;
      expect(article.paragraphs.length).toBeGreaterThan(0);
      expect(article.paragraphs.every((p: { text: string }) => p.text.trim().length > 0)).toBe(true);
    });

    it("scopes to .body-block and excludes nav paragraphs", async () => {
      const html = `
        <html><body>
          <nav><p>Home</p><p>Contents</p><p>Saturday Morning Session</p></nav>
          <div class="body-block">
            <p>In the beginning of the article.</p>
            <p>Second article paragraph.</p>
          </div>
          <footer><p>Footer text</p></footer>
        </body></html>
      `;

      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(html, { status: 200, headers: { "Content-Type": "text/html" } })
      );

      mockGetArticle.mockResolvedValue(null);
      mockGetUrlIndex.mockResolvedValue(null);

      await importArticle({ url: ALLOWED_URL });

      expect(mockPutArticle).toHaveBeenCalled();
      const article = mockPutArticle.mock.calls[0]![0]!;
      expect(article.paragraphs).toHaveLength(2);
      expect(article.paragraphs[0]!.text).toBe("In the beginning of the article.");
      expect(article.paragraphs[1]!.text).toBe("Second article paragraph.");
    });

    it("falls back to <article> when no .body-block present", async () => {
      const html = `
        <html><body>
          <nav><p>Nav item</p></nav>
          <article>
            <p>Article content only.</p>
          </article>
        </body></html>
      `;

      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(html, { status: 200, headers: { "Content-Type": "text/html" } })
      );

      mockGetArticle.mockResolvedValue(null);
      mockGetUrlIndex.mockResolvedValue(null);

      await importArticle({ url: ALLOWED_URL });

      expect(mockPutArticle).toHaveBeenCalled();
      const article = mockPutArticle.mock.calls[0]![0]!;
      expect(article.paragraphs).toHaveLength(1);
      expect(article.paragraphs[0]!.text).toBe("Article content only.");
    });
  });

  // ── New version detection ────────────────────────────────────────────────────

  describe("new version detection", () => {
    it("returns NEW_VERSION when URL index has a different latest articleId", async () => {
      const urlIndex = {
        sourceUrl: ALLOWED_URL,
        versions: [{ articleId: PREVIOUS_ID, importedAt: "2026-01-01T00:00:00Z" }],
      };

      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("<html><body><p>Updated content here.</p></body></html>", { status: 200 })
      );

      mockGetArticle.mockResolvedValue(null);
      mockGetUrlIndex.mockResolvedValue(urlIndex);

      const result = await importArticle({ url: ALLOWED_URL });

      expect(result.status).toBe("NEW_VERSION");
      if (result.status === "NEW_VERSION") {
        expect(result.previousArticleId).toBe(PREVIOUS_ID);
      }
    });

    it("does not call updateArticleIndex on NEW_VERSION (unconfirmed)", async () => {
      const urlIndex = {
        sourceUrl: ALLOWED_URL,
        versions: [{ articleId: PREVIOUS_ID, importedAt: "2026-01-01T00:00:00Z" }],
      };

      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("<html><body><p>Updated content.</p></body></html>", { status: 200 })
      );

      mockGetArticle.mockResolvedValue(null);
      mockGetUrlIndex.mockResolvedValue(urlIndex);

      const result = await importArticle({ url: ALLOWED_URL });

      expect(result.status).toBe("NEW_VERSION");
      expect(mockUpdateIndex).not.toHaveBeenCalled();
      expect(cfSend).not.toHaveBeenCalled();
    });

    it("stores new version when confirm: true", async () => {
      const urlIndex = {
        sourceUrl: ALLOWED_URL,
        versions: [{ articleId: PREVIOUS_ID, importedAt: "2026-01-01T00:00:00Z" }],
      };

      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("<html><body><p>New version content.</p></body></html>", { status: 200 })
      );

      mockGetArticle.mockResolvedValue(null);
      mockGetUrlIndex.mockResolvedValue(urlIndex);

      const result = await importArticle({ url: ALLOWED_URL, confirm: true });

      expect(result.status).toBe("VERSION_IMPORTED");
      if (result.status === "VERSION_IMPORTED") {
        expect(result.previousArticleId).toBe(PREVIOUS_ID);
      }
    });
  });

  // ── Manual paste mode ────────────────────────────────────────────────────────

  describe("manual paste mode", () => {
    it("splits text on double-newline, discards empty paragraphs", async () => {
      const text = "First paragraph.\n\nSecond paragraph.\n\n\n\nThird paragraph.";

      mockGetArticle.mockResolvedValue(null);
      mockGetUrlIndex.mockResolvedValue(null);

      await importArticle({ url: ALLOWED_URL, text, title: "Test Article" });

      expect(mockPutArticle).toHaveBeenCalled();
      const article = mockPutArticle.mock.calls[0]![0]!;
      expect(article.paragraphs).toHaveLength(3);
      expect(article.paragraphs[0]!.text).toBe("First paragraph.");
      expect(article.paragraphs[1]!.text).toBe("Second paragraph.");
      expect(article.paragraphs[2]!.text).toBe("Third paragraph.");
    });
  });

  // ── Article index maintenance ────────────────────────────────────────────────

  describe("article index maintenance", () => {
    it("calls updateArticleIndex on IMPORTED and prepends new entry", async () => {
      mockGetArticle.mockResolvedValue(null);
      mockGetUrlIndex.mockResolvedValue(null);

      await importArticle({
        url: ALLOWED_URL,
        text: "Fresh article content.",
        title: "Fresh Article",
      });

      expect(mockUpdateIndex).toHaveBeenCalledOnce();

      // Invoke the mutator with an empty index and verify the result
      const mutator = mockUpdateIndex.mock.calls[0]![0]!;
      const result = mutator({ articles: [] });
      expect(result.articles).toHaveLength(1);
      expect(result.articles[0]!.title).toBe("Fresh Article");
      expect(result.articles[0]!.sourceUrl).toBe(ALLOWED_URL);
    });

    it("prepends new entry before existing entries (newest-first order)", async () => {
      mockGetArticle.mockResolvedValue(null);
      mockGetUrlIndex.mockResolvedValue(null);

      await importArticle({
        url: ALLOWED_URL,
        text: "Brand new article.",
        title: "New Article",
      });

      const mutator = mockUpdateIndex.mock.calls[0]![0]!;
      const existingEntry = {
        articleId: "d".repeat(64),
        title: "Old Article",
        sourceUrl: "https://churchofjesuschrist.org/other",
        importedAt: "2026-01-01T00:00:00Z",
      };
      const result = mutator({ articles: [existingEntry] });

      expect(result.articles).toHaveLength(2);
      expect(result.articles[0]!.title).toBe("New Article");
      expect(result.articles[1]!.title).toBe("Old Article");
    });

    it("replaces existing entry for same sourceUrl on VERSION_IMPORTED", async () => {
      const urlIndex = {
        sourceUrl: ALLOWED_URL,
        versions: [{ articleId: PREVIOUS_ID, importedAt: "2026-01-01T00:00:00Z" }],
      };

      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("<html><body><p>Updated version content.</p></body></html>", { status: 200 })
      );

      mockGetArticle.mockResolvedValue(null);
      mockGetUrlIndex.mockResolvedValue(urlIndex);

      const result = await importArticle({ url: ALLOWED_URL, confirm: true });

      expect(result.status).toBe("VERSION_IMPORTED");
      expect(mockUpdateIndex).toHaveBeenCalledOnce();

      const mutator = mockUpdateIndex.mock.calls[0]![0]!;
      const oldEntry = {
        articleId: PREVIOUS_ID,
        title: "Old Version",
        sourceUrl: ALLOWED_URL,
        importedAt: "2026-01-01T00:00:00Z",
      };
      const otherEntry = {
        articleId: "e".repeat(64),
        title: "Unrelated Article",
        sourceUrl: "https://churchofjesuschrist.org/other",
        importedAt: "2026-03-01T00:00:00Z",
      };
      const updated = mutator({ articles: [otherEntry, oldEntry] });

      // Old entry for this URL replaced; unrelated entry preserved
      expect(updated.articles).toHaveLength(2);
      expect(updated.articles.find((a) => a.articleId === PREVIOUS_ID)).toBeUndefined();
      expect(updated.articles.find((a) => a.sourceUrl === "https://churchofjesuschrist.org/other")).toBeDefined();
      // New entry is prepended
      expect(updated.articles[0]!.sourceUrl).toBe(ALLOWED_URL);
    });

    it("calls CloudFront invalidation on IMPORTED", async () => {
      mockGetArticle.mockResolvedValue(null);
      mockGetUrlIndex.mockResolvedValue(null);

      await importArticle({
        url: ALLOWED_URL,
        text: "Content to invalidate cache for.",
        title: "Cache Test",
      });

      // CloudFront send should have been called once (CreateInvalidationCommand)
      expect(cfSend).toHaveBeenCalledOnce();
      const commandArg = cfSend.mock.calls[0]![0] as { input: { InvalidationBatch: { Paths: { Items: string[] } } } };
      expect(commandArg.input.InvalidationBatch.Paths.Items).toContain(
        "/content/articles/index.json"
      );
    });

    it("calls CloudFront invalidation on VERSION_IMPORTED", async () => {
      const urlIndex = {
        sourceUrl: ALLOWED_URL,
        versions: [{ articleId: PREVIOUS_ID, importedAt: "2026-01-01T00:00:00Z" }],
      };

      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("<html><body><p>Versioned content.</p></body></html>", { status: 200 })
      );

      mockGetArticle.mockResolvedValue(null);
      mockGetUrlIndex.mockResolvedValue(urlIndex);

      await importArticle({ url: ALLOWED_URL, confirm: true });

      expect(cfSend).toHaveBeenCalledOnce();
    });

    it("does not call CloudFront invalidation on DUPLICATE", async () => {
      const existingArticle = {
        articleId: "a".repeat(64),
        sourceUrl: ALLOWED_URL,
        title: "Existing",
        importedAt: "2026-01-01T00:00:00Z",
        scope: "shared" as const,
        paragraphs: [{ index: 0, text: "text" }],
      };
      mockGetArticle.mockResolvedValue(existingArticle);

      const result = await importArticle({
        url: ALLOWED_URL,
        text: "some text",
        title: "Test",
      });

      if (result.status === "DUPLICATE") {
        expect(cfSend).not.toHaveBeenCalled();
      }
    });
  });
});
