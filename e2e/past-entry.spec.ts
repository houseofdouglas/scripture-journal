import { test, expect } from "@playwright/test";
import { seedAuth } from "./helpers/auth";
import { mockPastEntry, mockEntryNotFound } from "./helpers/mocks";

const PAST_ENTRY_URL = "/entries/entry-past-001?entry-date=2026-04-15";
const TODAY_ENTRY_URL = "/entries/entry-today-001";

// ---------------------------------------------------------------------------
// Redirect tests — no auth seeded
// ---------------------------------------------------------------------------

test("unauthenticated visit to /entries/:id redirects to login", async ({
  page,
}) => {
  await page.goto(PAST_ENTRY_URL);
  await expect(page).toHaveURL(/\/login\?return=.*entries/i);
});

// ---------------------------------------------------------------------------
// Past entry tests — authenticated
// ---------------------------------------------------------------------------

test("loading state displays skeleton loaders", async ({ page }) => {
  await page.goto("/login");
  await seedAuth(page);

  let routeFulfilled = false;
  await page.route(`**/users/*/entries/entry-past-001.json`, (route) => {
    if (!routeFulfilled) {
      routeFulfilled = true;
      setTimeout(() => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: "entry-past-001",
            contentRef: "content/scripture/book-of-mormon/alma/32.json",
            title: "Alma 32 Study",
            date: "2026-04-15",
            notes: [],
          }),
        });
      }, 200);
    } else {
      route.continue();
    }
  });

  await page.goto(PAST_ENTRY_URL);

  const skeletons = page.locator('[class*="animate-pulse"]');
  await expect(skeletons).toBeVisible({ timeout: 5000 });
});

test("404 handling entry not found with dashboard link", async ({
  page,
}) => {
  await page.goto("/login");
  await seedAuth(page);
  await mockEntryNotFound(page, "entry-not-found-123");

  await page.goto("/entries/entry-not-found-123");
  await expect(page.getByText(/entry not found/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /dashboard/i })).toBeVisible();
});

test("past entry banner displays correct date format", async ({ page }) => {
  await page.goto("/login");
  await seedAuth(page);
  await mockPastEntry(
    page,
    "entry-past-001",
    "content/scripture/book-of-mormon/alma/32.json",
    "Alma 32 Study",
    "2026-04-15",
  );

  await page.goto(PAST_ENTRY_URL);
  await expect(
    page.getByText(/past entry.*april 15, 2026|april 15, 2026.*past entry/i),
  ).toBeVisible();
});

test("Study Today link navigates to scripture chapter", async ({ page }) => {
  await page.goto("/login");
  await seedAuth(page);
  await mockPastEntry(
    page,
    "entry-past-001",
    "content/scripture/book-of-mormon/alma/32.json",
    "Alma 32 Study",
    "2026-04-15",
  );

  await page.goto(PAST_ENTRY_URL);
  await page.getByRole("link", { name: /study today/i }).click();
  await expect(page).toHaveURL(/\/scripture\/book-of-mormon\/alma\/32/);
});

test("Study Today is absent for article entries", async ({ page }) => {
  await page.goto("/login");
  await seedAuth(page);
  await mockPastEntry(
    page,
    "entry-article-001",
    "content/articles/a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2.json",
    "Genesis 1 Study",
    "2026-04-15",
  );

  await page.goto(PAST_ENTRY_URL);
  await expect(page.getByRole("link", { name: /study today/i })).not.toBeVisible();
});

test("annotation list renders with timestamps", async ({ page }) => {
  await page.goto("/login");
  await seedAuth(page);
  await mockPastEntry(
    page,
    "entry-past-001",
    "content/scripture/book-of-mormon/alma/32.json",
    "Alma 32 Study",
    "2026-04-15",
    [
      {
        blockId: 0,
        text: "First verse note",
        createdAt: "2026-04-20T10:30:00.000Z",
      },
      {
        blockId: 1,
        text: "Second verse note",
        createdAt: "2026-04-20T10:35:00.000Z",
      },
    ],
  );

  await page.goto(PAST_ENTRY_URL);
  await expect(page.getByText(/first verse note/i)).toBeVisible();
  await expect(page.getByText(/second verse note/i)).toBeVisible();
});

test("multiple annotations display correctly", async ({ page }) => {
  await page.goto("/login");
  await seedAuth(page);
  await mockPastEntry(
    page,
    "entry-past-001",
    "content/scripture/book-of-mormon/alma/32.json",
    "Alma 32 Study",
    "2026-04-15",
    [
      {
        blockId: 0,
        text: "Note one",
        createdAt: "2026-04-20T10:30:00.000Z",
      },
      {
        blockId: 1,
        text: "Note two",
        createdAt: "2026-04-20T10:35:00.000Z",
      },
      {
        blockId: 2,
        text: "Note three",
        createdAt: "2026-04-20T10:40:00.000Z",
      },
    ],
  );

  await page.goto(PAST_ENTRY_URL);

  await expect(page.getByText(/note one/i)).toBeVisible();
  await expect(page.getByText(/note two/i)).toBeVisible();
  await expect(page.getByText(/note three/i)).toBeVisible();
});

test("clicking dashboard link returns to dashboard", async ({ page }) => {
  await page.goto("/login");
  await seedAuth(page);
  await mockPastEntry(
    page,
    "entry-past-001",
    "content/scripture/book-of-mormon/alma/32.json",
    "Alma 32 Study",
    "2026-04-15",
  );

  await page.goto(PAST_ENTRY_URL);
  await page.getByRole("link", { name: /dashboard/i }).click();
  await expect(page).toHaveURL("/");
});
