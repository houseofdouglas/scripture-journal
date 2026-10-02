import { createHash } from "crypto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
  setArticleArchived: vi.fn(),
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

// Figure I/O: the SSRF-safe image fetcher and the S3 asset writer. Constants
// and helpers (MAX_*_BYTES, sha256Hex) stay real.
vi.mock("../article-extract/image-fetch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../article-extract/image-fetch")>()),
  fetchImage: vi.fn(),
}));
vi.mock("../../repository/asset", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../repository/asset")>()),
  putAsset: vi.fn(),
}));

import { readFileSync } from "fs";
import path from "path";
import { JSDOM, VirtualConsole } from "jsdom";
import { importArticle, archiveArticle, unarchiveArticle } from "../article-import";
import * as imageFetchModule from "../article-extract/image-fetch";
import * as assetRepo from "../../repository/asset";
import { ArticleSchema, assetKey, type Article } from "../../types/article";
import { ValidationError } from "../errors";
import { WriteConflictError } from "../../repository/errors";
import * as articleRepo from "../../repository/article";
import * as cfModule from "@aws-sdk/client-cloudfront";

const mockGetArticle = vi.mocked(articleRepo.getArticle);
const mockPutArticle = vi.mocked(articleRepo.putArticle);
const mockGetUrlIndex = vi.mocked(articleRepo.getArticleUrlIndex);
const mockUpdateUrlIndex = vi.mocked(articleRepo.updateArticleUrlIndex);
const mockUpdateIndex = vi.mocked(articleRepo.updateArticleIndex);
const mockSetArticleArchived = vi.mocked(articleRepo.setArticleArchived);
// Access the shared send spy via the module's __cloudFrontSend export
const cfSend = (cfModule as unknown as { __cloudFrontSend: ReturnType<typeof vi.fn> }).__cloudFrontSend;

const mockFetchImage = vi.mocked(imageFetchModule.fetchImage);
const mockPutAsset = vi.mocked(assetRepo.putAsset);

const FIXTURES = path.join(__dirname, "fixtures");
const fixtureHtml = (name: string): string => readFileSync(path.join(FIXTURES, "html", name), "utf8");
const fixtureImage = (name: string): Uint8Array => new Uint8Array(readFileSync(path.join(FIXTURES, "images", name)));
const BASELINE_IDS = JSON.parse(readFileSync(path.join(FIXTURES, "baseline-ids.json"), "utf8")) as Record<
  "p-only.html" | "talk.html",
  string
>;

const ALLOWED_URL = "https://www.churchofjesuschrist.org/study/scriptures/bofm/alma/32";
const ANY_URL = "https://example.com/some-article";
const PREVIOUS_ID = "c".repeat(64);

describe("importArticle()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPutArticle.mockResolvedValue(undefined);
    mockUpdateUrlIndex.mockResolvedValue(undefined);
    mockUpdateIndex.mockResolvedValue(undefined);
    cfSend.mockResolvedValue({});
    mockFetchImage.mockImplementation(async (url) => ({
      ok: true,
      bytes: fixtureImage("tiny.png"),
      finalUrl: url,
      contentType: "image/png",
    }));
    mockPutAsset.mockImplementation(async (bytes, ext) => assetKey(assetRepo.sha256Hex(bytes), ext));
  });

  // ── Any-domain support ───────────────────────────────────────────────────────

  describe("any-domain support", () => {
    it("accepts URLs from any domain", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("<html><body><p>Article content.</p></body></html>", { status: 200 })
      );
      mockGetArticle.mockResolvedValue(null);
      mockGetUrlIndex.mockResolvedValue(null);

      const result = await importArticle({ url: ANY_URL });
      expect(["IMPORTED", "DUPLICATE"]).toContain(result.status);
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

      expect(result.status).toBe("DUPLICATE");
      expect(mockUpdateIndex).not.toHaveBeenCalled();
      expect(cfSend).not.toHaveBeenCalled();
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

      expect(result).toMatchObject({
        status: "IMPORTED",
        title: expect.stringContaining("Article Title"),
      });

      expect(mockPutArticle).toHaveBeenCalled();
      const article = mockPutArticle.mock.calls[0]![0];
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
      const article = mockPutArticle.mock.calls[0]![0];
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
      const article = mockPutArticle.mock.calls[0]![0];
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

      expect(result).toMatchObject({ status: "NEW_VERSION", previousArticleId: PREVIOUS_ID });
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

      expect(result).toMatchObject({ status: "VERSION_IMPORTED", previousArticleId: PREVIOUS_ID });
    });
  });

  // ── Rich block extraction (RAB-14) ───────────────────────────────────────────

  describe("rich block extraction (RAB-14)", () => {
    const REFERENCE_URL = "https://claude.com/blog/the-ai-native-sdlc-playbook";
    const TALK_URL = "https://www.churchofjesuschrist.org/study/general-conference/2024/10/57nelson?lang=eng";

    function servePage(html: string, finalUrl?: string) {
      return vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
        const res = new Response(html, { status: 200, headers: { "Content-Type": "text/html" } });
        if (finalUrl) Object.defineProperty(res, "url", { value: finalUrl });
        return res;
      });
    }

    async function importFresh(html: string, url: string): Promise<Article> {
      // Reset call records (implementations are kept) so each import is checked alone.
      vi.clearAllMocks();
      servePage(html);
      mockGetArticle.mockResolvedValue(null);
      mockGetUrlIndex.mockResolvedValue(null);
      const result = await importArticle({ url });
      expect(result.status).toBe("IMPORTED");
      expect(mockPutArticle).toHaveBeenCalledOnce();
      return mockPutArticle.mock.calls[0]![0]!;
    }

    let logSpy: ReturnType<typeof vi.spyOn>;
    let warnSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
      warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    });
    afterEach(() => {
      logSpy.mockRestore();
      warnSpy.mockRestore();
    });

    const importLogs = () =>
      logSpy.mock.calls
        .map((c) => JSON.parse(c[0] as string) as Record<string, unknown>)
        .filter((e) => e.message === "article import parsed");

    it("<p>-only fixture reproduces the pre-feature golden articleId", async () => {
      const article = await importFresh(fixtureHtml("p-only.html"), ANY_URL);
      expect(article.articleId).toBe(BASELINE_IDS["p-only.html"]);
      expect(article.title).toBe("A Paragraph-Only Article");
      expect(article.paragraphs.map((p) => p.index)).toEqual([0, 1, 2, 3, 4]);
      expect(article.paragraphs.every((p) => p.kind === undefined)).toBe(true);
      expect(mockFetchImage).not.toHaveBeenCalled();
    });

    it("talk fixture: every legacy <p> outside the new list is byte-identical; new list + figures change the id (FR-16)", async () => {
      const html = fixtureHtml("talk.html");
      const article = await importFresh(html, TALK_URL);

      // The pre-feature importer took every <p> under .body-block, including
      // the 17 <p>s inside the temple <ul>. Those now form one list block, and
      // the talk's 5 images are new figure blocks, so by FR-15/16 the id must
      // differ from the text-only baseline and route through NEW_VERSION.
      const doc = new JSDOM(html, { virtualConsole: new VirtualConsole() }).window.document;
      const legacy = Array.from(doc.querySelectorAll(".body-block p"))
        .filter((p) => !p.closest("li"))
        .map((p) => (p.textContent ?? "").trim())
        .filter(Boolean);
      const textBlocks = article.paragraphs.filter((p) => p.kind === undefined).map((p) => p.text);
      expect(textBlocks).toEqual(legacy);
      expect(article.paragraphs.filter((p) => p.kind === "list")).toHaveLength(1);
      expect(article.paragraphs.filter((p) => p.kind === "figure")).toHaveLength(5);
      expect(article.articleId).not.toBe(BASELINE_IDS["talk.html"]);
      expect(ArticleSchema.safeParse(article).success).toBe(true);
    });

    it("talk previously imported text-only (baseline id) → NEW_VERSION; confirm stores previousVersionId", async () => {
      const urlIndex = {
        sourceUrl: TALK_URL,
        versions: [{ articleId: BASELINE_IDS["talk.html"], importedAt: "2026-01-01T00:00:00Z" }],
      };
      servePage(fixtureHtml("talk.html"));
      mockGetArticle.mockResolvedValue(null);
      mockGetUrlIndex.mockResolvedValue(urlIndex);

      const first = await importArticle({ url: TALK_URL });
      expect(first).toMatchObject({ status: "NEW_VERSION", previousArticleId: BASELINE_IDS["talk.html"] });
      expect(mockPutArticle).not.toHaveBeenCalled();

      const second = await importArticle({ url: TALK_URL, confirm: true });
      expect(second).toMatchObject({ status: "VERSION_IMPORTED", previousArticleId: BASELINE_IDS["talk.html"] });
      expect(mockPutArticle).toHaveBeenCalledOnce();
      const stored = mockPutArticle.mock.calls[0]![0]!;
      expect(stored.previousVersionId).toBe(BASELINE_IDS["talk.html"]);
      expect(ArticleSchema.safeParse(stored).success).toBe(true);
      expect(mockUpdateUrlIndex).toHaveBeenCalledWith(TALK_URL, stored.articleId, stored.importedAt);
    });

    it("reference fixture → headings 10/21/38, 19 lists, 13 code, 1 table, 4 available figures, schema-valid", async () => {
      const article = await importFresh(fixtureHtml("reference-ai-native-sdlc.html"), REFERENCE_URL);
      const of = (kind: string) => article.paragraphs.filter((p) => p.kind === kind);
      const headingLevels = of("heading").map((p) => p.heading!.level);
      expect(headingLevels.filter((l) => l === 2)).toHaveLength(10);
      expect(headingLevels.filter((l) => l === 3)).toHaveLength(21);
      expect(headingLevels.filter((l) => l === 4)).toHaveLength(38);
      expect(of("list")).toHaveLength(19);
      expect(of("code")).toHaveLength(13);
      expect(of("table")).toHaveLength(1);
      expect(of("figure")).toHaveLength(4);
      expect(of("figure").every((p) => p.figure!.unavailable === undefined && p.figure!.assetKey !== null)).toBe(true);
      expect(article.paragraphs.map((p) => p.index)).toEqual(article.paragraphs.map((_, i) => i));
      expect(ArticleSchema.safeParse(article).success).toBe(true);
      // Figures are fetched with the page URL as base and stored via putAsset.
      expect(mockFetchImage).toHaveBeenCalled();
      expect(mockPutAsset).toHaveBeenCalled();
    });

    it("emits one structured import log with counts and no URL", async () => {
      await importFresh(fixtureHtml("reference-ai-native-sdlc.html"), REFERENCE_URL);
      const logs = importLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({ level: "info", figureCount: 4, unavailableFigureCount: 0 });
      expect(logs[0]!.articleId).toMatch(/^[0-9a-f]{64}$/);
      expect(logs[0]!.blockCount).toBeGreaterThan(100);
      expect(JSON.stringify(logs[0])).not.toMatch(/https?:/);
    });

    it("an image failure still imports, with an unavailable figure and a different articleId", async () => {
      const html = fixtureHtml("reference-ai-native-sdlc.html");
      const ok = await importFresh(html, REFERENCE_URL);

      mockFetchImage.mockResolvedValue({ ok: false, reason: "HTTP_ERROR" });
      const failed = await importFresh(html, REFERENCE_URL);

      const figures = failed.paragraphs.filter((p) => p.kind === "figure");
      expect(figures).toHaveLength(4);
      expect(figures.every((p) => p.figure!.unavailable === true && p.figure!.assetKey === null)).toBe(true);
      expect(ArticleSchema.safeParse(failed).success).toBe(true);
      expect(failed.articleId).not.toBe(ok.articleId);
      // Same text, only the figure hash parts differ.
      expect(failed.paragraphs.map((p) => p.text)).toEqual(ok.paragraphs.map((p) => p.text));
    });

    it("resolves relative image URLs against the final URL after redirects", async () => {
      const html = `<html><body><article><p>Intro paragraph.</p><figure><img src="img/a.png" alt="A"><figcaption>Cap</figcaption></figure></article></body></html>`;
      servePage(html, "https://final.example.com/posts/1");
      mockGetArticle.mockResolvedValue(null);
      mockGetUrlIndex.mockResolvedValue(null);

      await importArticle({ url: "https://short.example/x" });

      expect(mockFetchImage).toHaveBeenCalledOnce();
      expect(mockFetchImage.mock.calls[0]![0]).toBe("https://final.example.com/posts/img/a.png");
      const article = mockPutArticle.mock.calls[0]![0]!;
      expect(article.paragraphs[1]).toMatchObject({ index: 1, kind: "figure", text: "Cap" });
    });

    it("throws ValidationError when the page has no content blocks", async () => {
      servePage("<html><body><nav><p>Home</p></nav><footer><p>Footer</p></footer></body></html>");
      mockGetArticle.mockResolvedValue(null);
      mockGetUrlIndex.mockResolvedValue(null);

      await expect(importArticle({ url: ANY_URL })).rejects.toThrow(ValidationError);
      expect(mockGetArticle).not.toHaveBeenCalled();
      expect(mockPutArticle).not.toHaveBeenCalled();
    });

    it("refuses to store an article that fails ArticleSchema", async () => {
      // A malformed asset key makes the figure block invalid.
      mockPutAsset.mockResolvedValue("not-a-content-key");
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
      servePage(`<html><body><p>Text.</p><img src="https://cdn.example.com/a.png" alt="A"></body></html>`);
      mockGetArticle.mockResolvedValue(null);
      mockGetUrlIndex.mockResolvedValue(null);

      await expect(importArticle({ url: ANY_URL })).rejects.toThrow(ValidationError);
      expect(mockPutArticle).not.toHaveBeenCalled();
      expect(errSpy).toHaveBeenCalled();
      errSpy.mockRestore();
    });

    it("returns DUPLICATE for an unchanged rich page without writing the article", async () => {
      const html = fixtureHtml("reference-ai-native-sdlc.html");
      const first = await importFresh(html, REFERENCE_URL);

      vi.clearAllMocks();
      servePage(html);
      mockGetArticle.mockResolvedValue(first);
      const result = await importArticle({ url: REFERENCE_URL });

      expect(result).toMatchObject({ status: "DUPLICATE", articleId: first.articleId });
      expect(mockGetArticle).toHaveBeenCalledWith(first.articleId);
      expect(mockPutArticle).not.toHaveBeenCalled();
      expect(mockUpdateIndex).not.toHaveBeenCalled();
    });

    it("manual-paste mode does not fetch the page or images", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      mockGetArticle.mockResolvedValue(null);
      mockGetUrlIndex.mockResolvedValue(null);

      const text = "Alpha.\n\nBeta.";
      await importArticle({ url: ANY_URL, text, title: "Pasted" });

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(mockFetchImage).not.toHaveBeenCalled();
      const article = mockPutArticle.mock.calls[0]![0]!;
      expect(article.articleId).toBe(require("crypto").createHash("sha256").update(text).digest("hex"));
      expect(article.paragraphs).toEqual([
        { index: 0, text: "Alpha." },
        { index: 1, text: "Beta." },
      ]);
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
      const article = mockPutArticle.mock.calls[0]![0];
      expect(article.paragraphs).toHaveLength(3);
      expect(article.paragraphs[0]!.text).toBe("First paragraph.");
      expect(article.paragraphs[1]!.text).toBe("Second paragraph.");
      expect(article.paragraphs[2]!.text).toBe("Third paragraph.");
    });
  });

  // ── PDF import mode ──────────────────────────────────────────────────────────

  describe("PDF import mode", () => {
    it("imports when no url is provided", async () => {
      mockGetArticle.mockResolvedValue(null);
      mockGetUrlIndex.mockResolvedValue(null);

      const result = await importArticle({ text: "Paragraph one.\n\nParagraph two.", title: "My PDF" });

      expect(result.status).toBe("IMPORTED");
      expect(mockPutArticle).toHaveBeenCalledOnce();
      const article = mockPutArticle.mock.calls[0]![0];
      expect(article.title).toBe("My PDF");
      expect(article.sourceUrl).toMatch(/^pdf-import:/);
      expect(article.paragraphs).toHaveLength(2);
    });

    it("returns DUPLICATE for identical PDF content", async () => {
      const text = "Same content.";
      const articleId = createHash("sha256").update(text).digest("hex");
      mockGetArticle.mockResolvedValue({
        articleId,
        sourceUrl: `pdf-import:${articleId}`,
        title: "Existing",
        importedAt: "2026-01-01T00:00:00Z",
        scope: "shared" as const,
        paragraphs: [{ index: 0, text }],
      });

      const result = await importArticle({ text, title: "My PDF" });

      expect(result.status).toBe("DUPLICATE");
      expect(mockPutArticle).not.toHaveBeenCalled();
    });

    it("does not perform a network fetch for PDF mode", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      mockGetArticle.mockResolvedValue(null);
      mockGetUrlIndex.mockResolvedValue(null);

      await importArticle({ text: "Some text.", title: "PDF Article" });

      expect(fetchSpy).not.toHaveBeenCalled();
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
      const mutator = mockUpdateIndex.mock.calls[0]![0];
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

      const mutator = mockUpdateIndex.mock.calls[0]![0];
      const existingEntry = {
        articleId: "d".repeat(64),
        title: "Old Article",
        sourceUrl: "https://churchofjesuschrist.org/other",
        importedAt: "2026-01-01T00:00:00Z",
        archived: false,
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

      const mutator = mockUpdateIndex.mock.calls[0]![0];
      // Old entry for this sourceUrl is archived — the new version must NOT inherit that.
      const oldEntry = {
        articleId: PREVIOUS_ID,
        title: "Old Version",
        sourceUrl: ALLOWED_URL,
        importedAt: "2026-01-01T00:00:00Z",
        archived: true,
      };
      const otherEntry = {
        articleId: "e".repeat(64),
        title: "Unrelated Article",
        sourceUrl: "https://churchofjesuschrist.org/other",
        importedAt: "2026-03-01T00:00:00Z",
        archived: false,
      };
      const updated = mutator({ articles: [otherEntry, oldEntry] });

      // Old entry for this URL replaced; unrelated entry preserved
      expect(updated.articles).toHaveLength(2);
      expect(updated.articles.find((a) => a.articleId === PREVIOUS_ID)).toBeUndefined();
      expect(updated.articles.find((a) => a.sourceUrl === "https://churchofjesuschrist.org/other")).toBeDefined();
      // New entry is prepended and starts unarchived, even though the URL's previous entry was archived
      expect(updated.articles[0]!.sourceUrl).toBe(ALLOWED_URL);
      expect(updated.articles[0]!.archived).toBe(false);
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

      expect(result.status).toBe("DUPLICATE");
      expect(cfSend).not.toHaveBeenCalled();
    });
  });
});

describe("archiveArticle()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cfSend.mockResolvedValue({});
  });

  it("returns { articleId, archived: true } and invalidates the index on success", async () => {
    mockSetArticleArchived.mockResolvedValue(true);

    const result = await archiveArticle("a".repeat(64));

    expect(result).toEqual({ articleId: "a".repeat(64), archived: true });
    expect(mockSetArticleArchived).toHaveBeenCalledWith("a".repeat(64), true);
    expect(cfSend).toHaveBeenCalledOnce();
  });

  it("returns null and does not invalidate when the article is not in the index", async () => {
    mockSetArticleArchived.mockResolvedValue(false);

    const result = await archiveArticle("a".repeat(64));

    expect(result).toBeNull();
    expect(cfSend).not.toHaveBeenCalled();
  });

  it("propagates WriteConflictError from the repository", async () => {
    mockSetArticleArchived.mockRejectedValue(new WriteConflictError("content/articles/index.json"));

    await expect(archiveArticle("a".repeat(64))).rejects.toThrow(WriteConflictError);
  });
});

describe("unarchiveArticle()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cfSend.mockResolvedValue({});
  });

  it("returns { articleId, archived: false } and invalidates the index on success", async () => {
    mockSetArticleArchived.mockResolvedValue(true);

    const result = await unarchiveArticle("a".repeat(64));

    expect(result).toEqual({ articleId: "a".repeat(64), archived: false });
    expect(mockSetArticleArchived).toHaveBeenCalledWith("a".repeat(64), false);
    expect(cfSend).toHaveBeenCalledOnce();
  });

  it("returns null and does not invalidate when the article is not in the index", async () => {
    mockSetArticleArchived.mockResolvedValue(false);

    const result = await unarchiveArticle("a".repeat(64));

    expect(result).toBeNull();
    expect(cfSend).not.toHaveBeenCalled();
  });

  it("propagates WriteConflictError from the repository", async () => {
    mockSetArticleArchived.mockRejectedValue(new WriteConflictError("content/articles/index.json"));

    await expect(unarchiveArticle("a".repeat(64))).rejects.toThrow(WriteConflictError);
  });
});
