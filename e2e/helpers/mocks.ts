import { Page } from "@playwright/test";
import { createHash } from "crypto";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Mirrors `buildEntryId()` in src/repository/annotation.ts (annotation spec
 * FR-6): `${date}_${sha256(contentRef).slice(0, 16)}`. The client derives the
 * same id (src/ui/lib/entry-id.ts) to GET today's entry, so a mocked entry
 * must be served at this exact key or the app silently treats it as missing.
 */
function computeEntryId(date: string, contentRef: string): string {
  const hash = createHash("sha256").update(contentRef).digest("hex").slice(0, 16);
  return `${date}_${hash}`;
}

/** Local Y-M-D date string, matching how the SPA derives "today" for entryId purposes. */
function localDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Base64url-encode a string (no padding). */
function b64url(str: string): string {
  return Buffer.from(str)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Build a plausible (but unsigned) JWT suitable for auth-context decoding. */
function buildFakeJwt(payload: Record<string, unknown>): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  return `${header}.${body}.fakesig`;
}

// ---------------------------------------------------------------------------
// Default fixture data
// ---------------------------------------------------------------------------

const DEFAULT_MANIFEST = {
  works: [
    {
      slug: "book-of-mormon",
      title: "Book of Mormon",
      books: [
        { slug: "1-nephi", title: "1 Nephi", chapterCount: 22 },
        { slug: "alma", title: "Alma", chapterCount: 63 },
      ],
    },
    {
      slug: "doctrine-and-covenants",
      title: "Doctrine and Covenants",
      books: [{ slug: "dc", title: "Sections", chapterCount: 138 }],
    },
    {
      slug: "pearl-of-great-price",
      title: "Pearl of Great Price",
      books: [{ slug: "moses", title: "Moses", chapterCount: 8 }],
    },
    {
      slug: "bible-kjv",
      title: "Old Testament",
      books: [{ slug: "genesis", title: "Genesis", chapterCount: 50 }],
    },
  ],
};

const DEFAULT_CHAPTER = {
  work: "book-of-mormon",
  book: "alma",
  chapter: 32,
  title: "Alma 32",
  verses: [
    { number: 1, text: "And it came to pass that they did go forth." },
    {
      number: 2,
      text: "And now, as I said unto you, that because ye were compelled to be humble.",
    },
    {
      number: 3,
      text: "Now I say unto you that ye had better repent, that ye do not bring the wrath of God.",
    },
  ],
};

const DEFAULT_USER_INDEX = { entries: [] };

// ---------------------------------------------------------------------------
// Auth mocks
// ---------------------------------------------------------------------------

export async function mockLoginSuccess(
  page: Page,
  username = "peter",
  userId = "00000000-0000-0000-0000-000000000001",
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 86400;
  const token = buildFakeJwt({ sub: userId, username, iat: now, exp });
  const expiresAt = new Date(exp * 1000).toISOString();

  await page.route("**/api/auth/login", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ token, expiresAt }),
    });
  });
}

export async function mockLoginFailure(
  page: Page,
  status = 401,
): Promise<void> {
  await page.route("**/api/auth/login", (route) => {
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify({
        error: status === 429 ? "Too many requests" : "Invalid credentials",
      }),
    });
  });
}

// ---------------------------------------------------------------------------
// Scripture content mocks
// ---------------------------------------------------------------------------

export async function mockScriptureManifest(
  page: Page,
  manifest = DEFAULT_MANIFEST,
): Promise<void> {
  await page.route("**/content/scripture/manifest.json", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(manifest),
    });
  });
}

export async function mockScriptureChapter(
  page: Page,
  chapter = DEFAULT_CHAPTER,
): Promise<void> {
  // Pattern requires at least work/book/chapter.json — does NOT match manifest.json
  await page.route("**/content/scripture/*/*/*.json", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(chapter),
    });
  });
}

// ---------------------------------------------------------------------------
// User index mock
// ---------------------------------------------------------------------------

/** Matches the UserIndexEntry shape from src/types/annotation.ts */
export interface EntryStub {
  entryId: string;
  date: string; // YYYY-MM-DD
  contentRef: string;
  contentTitle: string;
  contentType: "scripture" | "article";
  projectId?: string;
  snippet?: string;
  noteCount?: number;
}

export async function mockUserIndex(
  page: Page,
  entries: EntryStub[] = [],
): Promise<void> {
  // Fill in defaults for optional fields so the component renders correctly
  const full = entries.map((e) => ({
    ...e,
    projectId: e.projectId ?? "personal",
    snippet: e.snippet ?? "",
    noteCount: e.noteCount ?? 1,
  }));

  await page.route("**/users/*/index.json", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ entries: full }),
    });
  });
}

// ---------------------------------------------------------------------------
// Annotation mocks
// ---------------------------------------------------------------------------

export async function mockAnnotateSuccess(
  page: Page,
  response?: Record<string, unknown>,
): Promise<void> {
  await page.route("**/api/entries/annotate", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        response ?? {
          annotation: {
            blockId: 1,
            text: "My saved note about this verse.",
            createdAt: new Date().toISOString(),
          },
        },
      ),
    });
  });
}

export async function mockAnnotateFailure(
  page: Page,
  status = 500,
): Promise<void> {
  await page.route("**/api/entries/annotate", (route) => {
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify({ error: "Internal server error" }),
    });
  });
}

// ---------------------------------------------------------------------------
// Article mocks
// ---------------------------------------------------------------------------

const DEFAULT_ARTICLE = {
  articleId: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
  sourceUrl: "https://www.churchofjesuschrist.org/study/manual/genesis/1?lang=eng",
  title: "Genesis Chapter 1",
  importedAt: "2026-04-20T10:30:00.000Z",
  scope: "shared" as const,
  paragraphs: [
    { index: 0, text: "In the beginning God created the heaven and the earth." },
    { index: 1, text: "And the earth was without form, and void; and darkness was upon the face of the deep." },
    { index: 2, text: "And God said, Let there be light: and there was light." },
  ],
};

export async function mockArticle(
  page: Page,
  article = DEFAULT_ARTICLE,
  entryData?: { entryId: string; title: string; notes: unknown[] },
): Promise<void> {
  await page.route("**/content/articles/*.json", async (route) => {
    console.log("[mockArticle] matching content route for URL:", route.request().url());
    const body = JSON.stringify(article);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: body,
    });
    console.log("[mockArticle] fulfilled response");
  });

  if (entryData) {
    const contentRef = `content/articles/${article.articleId}.json`;
    const date = localDateString(new Date());
    const entryId = computeEntryId(date, contentRef);

    const annotations = entryData.notes.map((note: any) => ({
      blockId: note.blockId,
      text: note.text,
      createdAt: note.createdAt,
    }));

    // Must satisfy JournalEntrySchema (src/types/annotation.ts) — the SPA
    // parses this response and silently drops it on a schema mismatch.
    const entryResponse = {
      entryId,
      userId: "00000000-0000-0000-0000-000000000001",
      date,
      contentRef,
      contentTitle: entryData.title,
      contentType: "article",
      projectId: "personal",
      annotations,
      updatedAt: new Date().toISOString(),
    };

    await page.route(`**/users/*/entries/${entryId}.json`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(entryResponse),
      });
    });
  } else {
    // For tests that don't pass entryData, just mock a simple entry
    await page.route(`**/users/*/entries/*.json`, (route) => {
      route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Entry not found" }),
      });
    });
  }
}

// ---------------------------------------------------------------------------
// Past entry mocks
// ---------------------------------------------------------------------------

/** Default userId — matches seedAuth()'s default JWT `sub`. */
const DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000001";

export async function mockPastEntry(
  page: Page,
  entryId: string,
  contentRef: string,
  title: string,
  date: string,
  notes: unknown[] = [],
): Promise<void> {
  const contentType = contentRef.includes("/articles/") ? "article" : "scripture";

  await page.route(`**/users/*/entries/${entryId}.json`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      // Shape matches JournalEntrySchema (src/types/annotation.ts) —
      // PastEntryPage/useJournalEntry parses this and 404s on mismatch.
      body: JSON.stringify({
        entryId,
        userId: DEFAULT_USER_ID,
        date,
        contentRef,
        contentTitle: title,
        contentType,
        projectId: "personal",
        annotations: notes,
        updatedAt: new Date().toISOString(),
      }),
    });
  });
}

export async function mockEntryNotFound(
  page: Page,
  entryId: string,
): Promise<void> {
  await page.route(`**/users/*/entries/${entryId}.json`, (route) => {
    route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: "Entry not found" }),
    });
  });
}

// ---------------------------------------------------------------------------
// Change password mocks
// ---------------------------------------------------------------------------

export async function mockChangePasswordSuccess(page: Page): Promise<void> {
  await page.route("**/api/auth/password", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });
}

export async function mockChangePasswordFailure(
  page: Page,
  status = 500,
): Promise<void> {
  await page.route("**/api/auth/password", (route) => {
    route.fulfill({
      status,
      contentType: "application/json",
      // Per docs/specs/auth.md: 401 here is the domain-specific
      // WRONG_CURRENT_PASSWORD error, not a session-expired 401.
      body: JSON.stringify({
        error: status === 401 ? "WRONG_CURRENT_PASSWORD" : "Internal server error",
      }),
    });
  });
}

// ---------------------------------------------------------------------------
// Article import mocks
// ---------------------------------------------------------------------------

export async function mockImportDuplicate(
  page: Page,
  articleId: string,
  title: string,
  importedAt: string,
): Promise<void> {
  await page.route("**/api/articles/import", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "DUPLICATE",
        articleId,
        title,
        importedAt,
      }),
    });
  });
}

export async function mockImportNewVersion(
  page: Page,
  url: string,
  previousArticleId: string,
  previousImportedAt: string,
  title: string,
): Promise<void> {
  await page.route("**/api/articles/import", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "NEW_VERSION",
        url,
        previousArticleId,
        previousImportedAt,
        title,
      }),
    });
  });
}

export async function mockImportVersionSuccess(
  page: Page,
  articleId: string,
  title: string,
  previousArticleId: string,
  importedAt: string,
): Promise<void> {
  await page.route("**/api/articles/import", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "VERSION_IMPORTED",
        articleId,
        title,
        previousArticleId,
        importedAt,
      }),
    });
  });
}

export async function mockImportSuccess(
  page: Page,
  articleId: string,
  title: string,
  importedAt: string,
): Promise<void> {
  await page.route("**/api/articles/import", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "IMPORTED",
        articleId,
        title,
        importedAt,
      }),
    });
  });
}

export async function mockImportDomainError(page: Page): Promise<void> {
  await page.route("**/api/articles/import", (route) => {
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        error: "DOMAIN_NOT_ALLOWED",
        fields: { url: "Domain not in allowlist" },
      }),
    });
  });
}

export async function mockImportFetchFailure(page: Page): Promise<void> {
  await page.route("**/api/articles/import", (route) => {
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        error: "FETCH_FAILED",
        fields: { url: "Could not fetch the article" },
      }),
    });
  });
}

// ---------------------------------------------------------------------------
// Archive / unarchive mocks
// ---------------------------------------------------------------------------

export interface ArticleIndexEntryFixture {
  articleId: string;
  title: string;
  sourceUrl: string;
  importedAt: string;
  archived: boolean;
}

/**
 * Mocks `content/articles/index.json`. Register this AFTER `mockArticle()`
 * in the same test — both use a `*.json` glob under `content/articles/`, and
 * Playwright dispatches to the most-recently-registered matching handler, so
 * this exact-path route must come last to take priority over the broader one.
 */
export async function mockArticleIndex(
  page: Page,
  articles: ArticleIndexEntryFixture[],
): Promise<void> {
  await page.route("**/content/articles/index.json", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ articles }),
    });
  });
}

/** Mocks a successful `POST /api/articles/:id/archive`. */
export async function mockArchiveSuccess(
  page: Page,
  articleId: string,
): Promise<void> {
  await page.route(`**/api/articles/${articleId}/archive`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { articleId, archived: true } }),
    });
  });
}

/** Mocks a successful `POST /api/articles/:id/unarchive`. */
export async function mockUnarchiveSuccess(
  page: Page,
  articleId: string,
): Promise<void> {
  await page.route(`**/api/articles/${articleId}/unarchive`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { articleId, archived: false } }),
    });
  });
}

// ---------------------------------------------------------------------------
// PDF Textract extraction mocks
// ---------------------------------------------------------------------------

/** Mocks `POST /api/articles/extract-pdf/upload-url`. */
export async function mockExtractUploadUrl(
  page: Page,
  uploadUrl: string,
  key: string,
): Promise<void> {
  await page.route("**/api/articles/extract-pdf/upload-url", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ uploadUrl, key }),
    });
  });
}

/** Mocks the direct browser→S3 PUT at the presigned URL (matches by path, ignoring the query string). */
export async function mockS3Upload(
  page: Page,
  uploadUrl: string,
  status = 200,
): Promise<void> {
  const urlWithoutQuery = uploadUrl.split("?")[0];
  await page.route(`${urlWithoutQuery}**`, (route) => {
    route.fulfill({ status });
  });
}

/** Mocks a successful `POST /api/articles/extract-pdf`. */
export async function mockExtractPdfSuccess(
  page: Page,
  response: { paragraphs: string[]; suggestedTitle: string | null; pageCount: number },
): Promise<void> {
  await page.route("**/api/articles/extract-pdf", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response),
    });
  });
}

/** Mocks a failed `POST /api/articles/extract-pdf` (502 EXTRACTION_FAILED by default). */
export async function mockExtractPdfFailure(page: Page, status = 502): Promise<void> {
  await page.route("**/api/articles/extract-pdf", (route) => {
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify({ error: "EXTRACTION_FAILED", message: "Textract job failed" }),
    });
  });
}
