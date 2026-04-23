import { Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
