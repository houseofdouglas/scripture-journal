import { test, expect } from "@playwright/test";
import { seedAuth } from "./helpers/auth";
import { mockArticle } from "./helpers/mocks";

const ARTICLE_URL = "/articles/a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";

// ---------------------------------------------------------------------------
// Redirect tests — no auth seeded
// ---------------------------------------------------------------------------

test("unauthenticated visit to /articles/:id redirects to login", async ({
  page,
}) => {
  await page.goto(ARTICLE_URL);
  await expect(page).toHaveURL(/\/login\?return=.*articles/i);
});

// ---------------------------------------------------------------------------
// Article view tests — authenticated
// ---------------------------------------------------------------------------

test("article view shows article title in serif font", async ({ page }) => {
  await page.goto("/login");
  await seedAuth(page);
  await mockArticle(page);

  await page.goto(ARTICLE_URL);
  await expect(page.getByText(/Genesis Chapter 1/i)).toBeVisible();

  const titleFont = await page
    .getByText(/Genesis Chapter 1/i)
    .evaluate((el) => window.getComputedStyle(el).fontFamily);
  expect(titleFont).toContain("serif");
});

test("article view shows source link (clickable)", async ({ page }) => {
  await page.goto("/login");
  await seedAuth(page);
  await mockArticle(page);

  await page.goto(ARTICLE_URL);
  await expect(
    page.getByRole("link", { name: /source ↗/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /source ↗/i }),
  ).toHaveAttribute("href", "https://www.churchofjesuschrist.org/study/manual/genesis/1?lang=eng");
});

test("article view shows import date", async ({ page }) => {
  await page.goto("/login");
  await seedAuth(page);
  await mockArticle(page);

  await page.goto(ARTICLE_URL);
  await expect(page.getByText(/Imported April 20, 2026/i)).toBeVisible({ timeout: 10000 });
});

test("article view shows annotation count badge", async ({ page }) => {
  await page.goto("/login");
  await seedAuth(page);
  await mockArticle(
    page,
    undefined,
    {
      entryId: "entry-001",
      title: "Genesis 1 Study",
      notes: [
        {
          blockId: 0,
          text: "This is a note about the first verse.",
          createdAt: "2026-04-20T10:35:00.000Z",
        },
      ],
    },
  );

  await page.goto(ARTICLE_URL);
  await expect(page.getByText(/1 notes/i)).toBeVisible();
});

test("non-existent article shows Article not found with link to dashboard", async ({
  page,
}) => {
  await page.goto("/login");
  await seedAuth(page);

  const notFoundId = "/articles/nonexistentarticleid123";
  await page.route(`**/content/articles/${notFoundId.split("/").pop()}.json`, (route) => {
    route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: "Not found" }),
    });
  });

  await page.goto(notFoundId);
  await expect(page.getByText(/article not found/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /dashboard/i })).toBeVisible();
});

test("clicking article entry card navigates to article view", async ({
  page,
}) => {
  await page.goto("/login");
  await seedAuth(page);
  await mockArticle(page);

  await page.goto("/");
  await page.getByText("Genesis Chapter 1").click();
  await expect(page).toHaveURL(ARTICLE_URL);
});

test("back button from article view navigates to dashboard", async ({
  page,
}) => {
  await page.goto("/login");
  await seedAuth(page);
  await mockArticle(page);

  await page.goto(ARTICLE_URL);
  await page.getByRole("link", { name: /dashboard/i }).click();
  await expect(page).toHaveURL("/");
});

test("article with multiple paragraphs renders correctly", async ({ page }) => {
  await page.goto("/login");
  await seedAuth(page);
  await mockArticle(page);

  await page.goto(ARTICLE_URL);

  await expect(page.getByText(/God created the heaven and the earth/i)).toBeVisible();
  await expect(page.getByText(/earth was without form/i)).toBeVisible();
  await expect(page.getByText(/God said let there be light/i)).toBeVisible();
});

test("annotations display with timestamps", async ({ page }) => {
  await page.goto("/login");
  await seedAuth(page);
  await mockArticle(
    page,
    undefined,
    {
      entryId: "entry-001",
      title: "Genesis 1 Study",
      notes: [
        {
          blockId: 1,
          text: "Important note about verse 2.",
          createdAt: "2026-04-20T10:40:00.000Z",
        },
      ],
    },
  );

  await page.goto(ARTICLE_URL);
  await expect(page.getByText(/important note about verse 2/i)).toBeVisible();
});
