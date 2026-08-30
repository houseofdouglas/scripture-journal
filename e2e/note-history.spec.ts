import { test, expect } from "@playwright/test";
import { seedAuth } from "./helpers/auth";
import {
  mockScriptureManifest,
  mockScriptureChapter,
  mockUserIndex,
  mockPastEntry,
  mockEntryNotFound,
} from "./helpers/mocks";

const CHAPTER_URL = "/scripture/book-of-mormon/alma/32";
const CONTENT_REF = "content/scripture/book-of-mormon/alma/32.json";

function todayLocalDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await seedAuth(page);
  await mockScriptureManifest(page);
  await mockScriptureChapter(page);
});

// ---------------------------------------------------------------------------
// Happy path / filtering
// ---------------------------------------------------------------------------

test("rail lists past entries newest-first with a preview", async ({ page }) => {
  await mockUserIndex(page, [
    {
      entryId: "e-oldest",
      date: "2026-01-05",
      contentRef: CONTENT_REF,
      contentTitle: "Alma 32",
      contentType: "scripture",
      snippet: "An earlier reflection on the seed of faith.",
      noteCount: 1,
    },
    {
      entryId: "e-newest",
      date: "2026-06-10",
      contentRef: CONTENT_REF,
      contentTitle: "Alma 32",
      contentType: "scripture",
      snippet: "A more recent thought on nourishing the word.",
      noteCount: 3,
    },
  ]);

  await page.goto(CHAPTER_URL);
  await page.getByText("Past notes").waitFor();

  const rows = page.getByRole("button", { name: /reflection on the seed|nourishing the word/i });
  await expect(rows).toHaveCount(2);
  // Newest first
  await expect(rows.nth(0)).toContainText("nourishing the word");
  await expect(rows.nth(1)).toContainText("seed of faith");
});

test("today's entry is excluded; entries for a different contentRef never appear", async ({ page }) => {
  const today = todayLocalDate();

  await mockUserIndex(page, [
    {
      entryId: "e-today",
      date: today,
      contentRef: CONTENT_REF,
      contentTitle: "Alma 32",
      contentType: "scripture",
      snippet: "Written earlier today — should not appear in the rail.",
      noteCount: 1,
    },
    {
      entryId: "e-other-content",
      date: "2026-02-01",
      contentRef: "content/scripture/book-of-mormon/1-nephi/1.json",
      contentTitle: "1 Nephi 1",
      contentType: "scripture",
      snippet: "A note on a completely different chapter.",
      noteCount: 1,
    },
    {
      entryId: "e-legit-past",
      date: "2026-02-15",
      contentRef: CONTENT_REF,
      contentTitle: "Alma 32",
      contentType: "scripture",
      snippet: "A genuinely past reflection on this chapter.",
      noteCount: 1,
    },
  ]);

  await page.goto(CHAPTER_URL);
  await page.getByText("Past notes").waitFor();

  await expect(page.getByText(/genuinely past reflection/i)).toBeVisible();
  await expect(page.getByText(/should not appear in the rail/i)).toHaveCount(0);
  await expect(page.getByText(/completely different chapter/i)).toHaveCount(0);
});

test("an entry from a different project still appears in the rail", async ({ page }) => {
  await mockUserIndex(page, [
    {
      entryId: "e-work",
      date: "2026-03-01",
      contentRef: CONTENT_REF,
      contentTitle: "Alma 32",
      contentType: "scripture",
      projectId: "work",
      snippet: "A note taken under the work project.",
      noteCount: 1,
    },
  ]);

  await page.goto(CHAPTER_URL);

  await expect(page.getByText(/note taken under the work project/i)).toBeVisible();
});

// ---------------------------------------------------------------------------
// Modal / jump-to-verse
// ---------------------------------------------------------------------------

test("opening a row shows the full note text and an Open full entry link", async ({ page }) => {
  await mockUserIndex(page, [
    {
      entryId: "e-past-001",
      date: "2026-02-15",
      contentRef: CONTENT_REF,
      contentTitle: "Alma 32",
      contentType: "scripture",
      snippet: "The timing here seems tied to the earlier prophecy.",
      noteCount: 1,
    },
  ]);
  await mockPastEntry(page, "e-past-001", CONTENT_REF, "Alma 32", "2026-02-15", [
    { blockId: 2, text: "The timing here seems tied to the earlier prophecy about the gathering.", createdAt: "2026-02-15T10:00:00.000Z" },
  ]);

  await page.goto(CHAPTER_URL);
  await page.getByRole("button", { name: /timing here seems tied/i }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("The timing here seems tied to the earlier prophecy about the gathering.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Verse 2" })).toBeVisible();

  const link = dialog.getByRole("link", { name: /open full entry/i });
  await expect(link).toHaveAttribute("href", "/entries/e-past-001");
});

test("clicking a block label closes the modal and scrolls the verse into view", async ({ page }) => {
  await mockUserIndex(page, [
    {
      entryId: "e-past-002",
      date: "2026-02-15",
      contentRef: CONTENT_REF,
      contentTitle: "Alma 32",
      contentType: "scripture",
      snippet: "A note about verse 2.",
      noteCount: 1,
    },
  ]);
  await mockPastEntry(page, "e-past-002", CONTENT_REF, "Alma 32", "2026-02-15", [
    { blockId: 2, text: "A note about verse 2.", createdAt: "2026-02-15T10:00:00.000Z" },
  ]);

  await page.goto(CHAPTER_URL);
  await page.getByRole("button", { name: /note about verse 2/i }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Verse 2" }).click();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  const verseTwo = page.locator('[data-verse="2"]');
  await expect(verseTwo).toHaveClass(/block-flash/);
});

test("a row whose entry 404s shows the error message with a working Open full entry link", async ({ page }) => {
  await mockUserIndex(page, [
    {
      entryId: "e-missing",
      date: "2026-02-15",
      contentRef: CONTENT_REF,
      contentTitle: "Alma 32",
      contentType: "scripture",
      snippet: "This entry has since been deleted.",
      noteCount: 1,
    },
  ]);
  await mockEntryNotFound(page, "e-missing");

  await page.goto(CHAPTER_URL);
  await page.getByRole("button", { name: /since been deleted/i }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Couldn't load this entry.")).toBeVisible();
  await expect(dialog.getByRole("link", { name: /open full entry/i })).toHaveAttribute("href", "/entries/e-missing");
});

// ---------------------------------------------------------------------------
// Empty state / loading & error
// ---------------------------------------------------------------------------

test("empty state reads 'No past notes on this chapter.'", async ({ page }) => {
  await mockUserIndex(page, []);

  await page.goto(CHAPTER_URL);

  await expect(page.getByText("No past notes on this chapter.")).toBeVisible();
});

test("a user who has never annotated (index.json 404) sees the empty state, not an error", async ({ page }) => {
  await page.route("**/users/*/index.json", (route) => {
    route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "Not found" }) });
  });

  await page.goto(CHAPTER_URL);

  await expect(page.getByText("No past notes on this chapter.")).toBeVisible();
  await expect(page.getByText(/couldn't load note history/i)).toHaveCount(0);
});

test("a pulse skeleton occupies the rail while index.json is in flight; chapter text is already readable", async ({ page }) => {
  let resolveRoute: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    resolveRoute = resolve;
  });

  await page.route("**/users/*/index.json", async (route) => {
    await held;
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ entries: [] }) });
  });

  await page.goto(CHAPTER_URL);

  // Chapter content renders independently of the index request (spec FR-16)
  await expect(page.getByText("And it came to pass that they did go forth.")).toBeVisible();
  await expect(page.locator("aside .animate-pulse").first()).toBeVisible();

  resolveRoute!();
  await expect(page.getByText("No past notes on this chapter.")).toBeVisible();
});

test("with more than one project, rows and the modal show the project name", async ({ page }) => {
  await page.route("**/api/projects", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        projects: [
          { projectId: "personal", name: "Personal", createdAt: "2026-01-01T00:00:00.000Z" },
          { projectId: "work", name: "Work", createdAt: "2026-01-01T00:00:00.000Z" },
        ],
      }),
    });
  });
  await mockUserIndex(page, [
    {
      entryId: "e-badge",
      date: "2026-02-15",
      contentRef: CONTENT_REF,
      contentTitle: "Alma 32",
      contentType: "scripture",
      projectId: "work",
      snippet: "A note taken under the work project.",
      noteCount: 1,
    },
  ]);
  await mockPastEntry(page, "e-badge", CONTENT_REF, "Alma 32", "2026-02-15", [
    { blockId: 1, text: "A note taken under the work project.", createdAt: "2026-02-15T10:00:00.000Z" },
  ]);

  await page.goto(CHAPTER_URL);
  await expect(page.getByText("Work").first()).toBeVisible();

  await page.getByRole("button", { name: /note taken under the work project/i }).click();
  await expect(page.getByRole("dialog").getByText("Work")).toBeVisible();
});

test("index failure shows the error message and Retry recovers", async ({ page }) => {
  // The app's QueryClient retries a failed query once automatically before
  // settling into isError, so the mock must fail the initial fetch AND that
  // automatic retry — only the user's manual Retry click (the 3rd call) succeeds.
  let callCount = 0;
  await page.route("**/users/*/index.json", (route) => {
    callCount += 1;
    if (callCount <= 2) {
      route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Internal error" }) });
    } else {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          entries: [
            {
              entryId: "e-recovered",
              date: "2026-02-15",
              contentRef: CONTENT_REF,
              contentTitle: "Alma 32",
              contentType: "scripture",
              projectId: "personal",
              snippet: "Recovered after retry.",
              noteCount: 1,
            },
          ],
        }),
      });
    }
  });

  await page.goto(CHAPTER_URL);

  await expect(page.getByText(/couldn't load note history/i).first()).toBeVisible();
  await page.getByRole("button", { name: /retry/i }).first().click();

  await expect(page.getByText(/recovered after retry/i)).toBeVisible();
});

// ---------------------------------------------------------------------------
// Mobile disclosure
// ---------------------------------------------------------------------------

test("mobile disclosure at 375px collapses by default and expands on click", async ({ page }) => {
  await mockUserIndex(page, [
    {
      entryId: "e-mobile",
      date: "2026-02-15",
      contentRef: CONTENT_REF,
      contentTitle: "Alma 32",
      contentType: "scripture",
      snippet: "Visible only after expanding the disclosure.",
      noteCount: 1,
    },
  ]);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(CHAPTER_URL);

  const disclosure = page.getByRole("button", { name: /1 past note/i });
  await expect(disclosure).toBeVisible();
  await expect(disclosure).toHaveAttribute("aria-expanded", "false");
  // The desktop <aside> always contains this text (hidden via CSS at 375px,
  // not absent from the DOM) — assert on rendered visibility, not presence.
  await expect(page.getByText(/visible only after expanding/i)).not.toBeVisible();

  await disclosure.click();

  await expect(disclosure).toHaveAttribute("aria-expanded", "true");
  // Two matches now exist (the hidden desktop <aside> plus the newly-expanded
  // mobile rows, which come last in DOM order) — assert on the visible one.
  await expect(page.getByText(/visible only after expanding/i).last()).toBeVisible();
});

// ---------------------------------------------------------------------------
// Shared cache / navigation
// ---------------------------------------------------------------------------

test("only one index.json request is made navigating Dashboard to a chapter", async ({ page }) => {
  await mockUserIndex(page, []);

  const indexRequests: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes("/index.json")) indexRequests.push(req.url());
  });

  await page.goto("/");
  await page.getByText(/journal is empty|my journal/i).first().waitFor();

  // Client-side SPA navigation the whole way through — no full page reloads —
  // so the QueryClient instance (and its cache) persists across the trip.
  // Scoped to the nav bar — the Dashboard's empty state has its own "Browse
  // Scripture" CTA button, making the unscoped locator ambiguous.
  await page.getByRole("navigation").getByRole("link", { name: /browse scripture/i }).click();
  await page.getByRole("link", { name: /book of mormon/i }).click();
  // Link text is "Alma63" — the book title with its chapter count appended.
  await page.getByRole("link", { name: /^alma/i }).click();
  await page.getByRole("link", { name: "32", exact: true }).click();

  // Heading, not getByText — with an empty index the rail also shows "No
  // past notes on this chapter.", which contains "Past notes" as a substring.
  await page.getByRole("heading", { name: "Past notes" }).waitFor();
  expect(indexRequests.length).toBe(1);
});

// ---------------------------------------------------------------------------
// Scroll position / theme / multi-user isolation
// ---------------------------------------------------------------------------

test("closing the modal leaves the reader's scroll position unchanged", async ({ page }) => {
  await mockUserIndex(page, [
    {
      entryId: "e-scroll",
      date: "2026-02-15",
      contentRef: CONTENT_REF,
      contentTitle: "Alma 32",
      contentType: "scripture",
      snippet: "A note to open in the modal.",
      noteCount: 1,
    },
  ]);
  await mockPastEntry(page, "e-scroll", CONTENT_REF, "Alma 32", "2026-02-15", [
    { blockId: 1, text: "A note to open in the modal.", createdAt: "2026-02-15T10:00:00.000Z" },
  ]);

  // A short viewport forces real scroll even with this fixture's few verses.
  await page.setViewportSize({ width: 1200, height: 300 });
  await page.goto(CHAPTER_URL);

  await page.evaluate(() => window.scrollTo(0, 150));
  const before = await page.evaluate(() => window.scrollY);
  expect(before).toBeGreaterThan(0);

  await page.getByRole("button", { name: /note to open in the modal/i }).click();
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const after = await page.evaluate(() => window.scrollY);
  // Locking/unlocking body scroll via `overflow: hidden` toggles the
  // scrollbar's presence, which can reflow the page by a few px — a universal
  // side effect of this scroll-lock technique, not a functional regression.
  // The reader's actual reading position (which verse is in view) is intact.
  expect(Math.abs(after - before)).toBeLessThanOrEqual(10);
});

test("renders correctly in dark theme", async ({ page }) => {
  await mockUserIndex(page, [
    {
      entryId: "e-dark",
      date: "2026-02-15",
      contentRef: CONTENT_REF,
      contentTitle: "Alma 32",
      contentType: "scripture",
      snippet: "A note visible under dark mode.",
      noteCount: 1,
    },
  ]);

  await page.addInitScript(() => localStorage.setItem("theme", "dark"));
  await page.goto(CHAPTER_URL);

  await expect(page.locator("html")).toHaveClass(/dark/);
  const row = page.getByRole("button", { name: /note visible under dark mode/i });
  await expect(row).toBeVisible();

  // Confirm the fix for the muted-text contrast NFR actually applies in a real browser.
  const color = await row.locator("p").first().evaluate((el) => getComputedStyle(el).color);
  expect(color).toBe("rgb(209, 213, 219)"); // Tailwind gray-300 (dark:text-gray-300 on the snippet)
});

test("logging out and back in as a different user shows that user's own history, with no stale rows", async ({ page }) => {
  const userA = "11111111-1111-4111-8111-111111111111";
  const userB = "22222222-2222-4222-8222-222222222222";

  await page.route(`**/users/${userA}/index.json`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        entries: [
          {
            entryId: "e-user-a",
            date: "2026-02-15",
            contentRef: CONTENT_REF,
            contentTitle: "Alma 32",
            contentType: "scripture",
            projectId: "personal",
            snippet: "A note belonging to user A only.",
            noteCount: 1,
          },
        ],
      }),
    });
  });
  await page.route(`**/users/${userB}/index.json`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ entries: [] }) });
  });

  await page.goto("/login");
  await seedAuth(page, { sub: userA, userId: userA });
  await page.goto(CHAPTER_URL);
  await expect(page.getByText(/note belonging to user a/i)).toBeVisible();

  // Simulate logout/login as a different user with a fresh page load, which
  // also resets the in-memory QueryClient — exactly what a real logout does.
  await page.goto("/login");
  await seedAuth(page, { sub: userB, userId: userB });
  await page.goto(CHAPTER_URL);

  await expect(page.getByText("No past notes on this chapter.")).toBeVisible();
  await expect(page.getByText(/note belonging to user a/i)).toHaveCount(0);
});
