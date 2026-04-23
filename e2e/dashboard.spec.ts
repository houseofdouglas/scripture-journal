import { test, expect } from "@playwright/test";
import { seedAuth } from "./helpers/auth";
import { mockUserIndex } from "./helpers/mocks";

test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await seedAuth(page);
});

// ---------------------------------------------------------------------------

test("empty UserIndex shows 'Your journal is empty' with Browse Scripture and Import Article CTAs", async ({
  page,
}) => {
  await mockUserIndex(page, []);
  await page.goto("/");

  await expect(page.getByText(/your journal is empty/i)).toBeVisible();
  // Scope to main to avoid ambiguity with the nav links
  const main = page.getByRole("main");
  await expect(main.getByRole("link", { name: /browse scripture/i })).toBeVisible();
  await expect(main.getByRole("link", { name: /import article/i })).toBeVisible();
});

test("UserIndex with one entry renders an EntryCard with title, snippet, note count", async ({
  page,
}) => {
  await mockUserIndex(page, [
    {
      entryId: "entry-001",
      contentTitle: "Alma 32 Study",
      contentType: "scripture",
      contentRef: "content/scripture/book-of-mormon/alma/32.json",
      snippet: "Faith is like a seed...",
      noteCount: 3,
      date: "2026-04-20",
    },
  ]);
  await page.goto("/");

  await expect(page.getByText("Alma 32 Study")).toBeVisible();
  await expect(page.getByText(/faith is like a seed/i)).toBeVisible();
  // Note count badge — "3 notes"
  await expect(page.getByText(/3 notes/i)).toBeVisible();
});

test("UserIndex with two entries on the same date renders EntryDayGroup (no snippet)", async ({
  page,
}) => {
  await mockUserIndex(page, [
    {
      entryId: "entry-001",
      contentTitle: "Alma 32 Study",
      contentType: "scripture",
      contentRef: "content/scripture/book-of-mormon/alma/32.json",
      noteCount: 2,
      date: "2026-04-20",
    },
    {
      entryId: "entry-002",
      contentTitle: "Mosiah 4 Notes",
      contentType: "scripture",
      contentRef: "content/scripture/book-of-mormon/mosiah/4.json",
      noteCount: 1,
      date: "2026-04-20",
    },
  ]);
  await page.goto("/");

  await expect(page.getByText("Alma 32 Study")).toBeVisible();
  await expect(page.getByText("Mosiah 4 Notes")).toBeVisible();
  // A group header for the shared date should exist (scope to main to avoid calendar)
  await expect(page.getByRole("main").getByText(/monday, april 20|april 20,|2026-04-20/i)).toBeVisible();
});

test("clicking an entry card navigates to /entries/:entryId", async ({
  page,
}) => {
  await mockUserIndex(page, [
    {
      entryId: "entry-001",
      contentTitle: "Alma 32 Study",
      contentType: "scripture",
      contentRef: "content/scripture/book-of-mormon/alma/32.json",
      snippet: "Faith is like a seed...",
      noteCount: 1,
      date: "2026-04-20",
    },
  ]);

  // Mock the individual entry fetch
  await page.route("**/users/*/entries/entry-001.json", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "entry-001",
        title: "Alma 32 Study",
        notes: [],
      }),
    });
  });

  await page.goto("/");
  await page.getByText("Alma 32 Study").click();
  await expect(page).toHaveURL("/entries/entry-001");
});
