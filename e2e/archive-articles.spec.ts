import { test, expect, Page } from "@playwright/test";
import { seedAuth } from "./helpers/auth";
import { mockUserIndex, ArticleIndexEntryFixture } from "./helpers/mocks";

const ARTICLE_A_ID = "a".repeat(64);
const ARTICLE_B_ID = "b".repeat(64);

const ARTICLE_A_ENTRY: ArticleIndexEntryFixture = {
  articleId: ARTICLE_A_ID,
  title: "Faith in Jesus Christ",
  sourceUrl: "https://www.churchofjesuschrist.org/study/faith",
  importedAt: "2026-04-22T10:00:00.000Z",
  archived: false,
};

const ARTICLE_B_ENTRY: ArticleIndexEntryFixture = {
  articleId: ARTICLE_B_ID,
  title: "The Living Christ",
  sourceUrl: "https://www.churchofjesuschrist.org/study/living-christ",
  importedAt: "2026-05-01T10:00:00.000Z",
  archived: false,
};

const ARTICLE_A_CONTENT = {
  articleId: ARTICLE_A_ID,
  sourceUrl: ARTICLE_A_ENTRY.sourceUrl,
  title: ARTICLE_A_ENTRY.title,
  importedAt: ARTICLE_A_ENTRY.importedAt,
  scope: "shared" as const,
  paragraphs: [{ index: 0, text: "Faith is the first principle of the gospel of Jesus Christ." }],
};

/**
 * Wires up mutable, coupled mocks: archiving/unarchiving actually flips the
 * matching entry's `archived` flag in shared state, so a subsequent index
 * refetch (triggered by the app's own query invalidation) reflects the
 * change — this lets one test exercise a full archive → refetch → toggle →
 * unarchive round trip instead of a static per-request fixture.
 *
 * Each article's content route is registered on its exact path
 * (`content/articles/<id>.json`) rather than a shared wildcard, so it never
 * competes with the also-exact `content/articles/index.json` route.
 */
async function setupStatefulArchiveMocks(
  page: Page,
  initialArticles: ArticleIndexEntryFixture[],
  contentById: Record<string, unknown> = {},
): Promise<void> {
  const articles = initialArticles.map((a) => ({ ...a }));

  for (const [articleId, content] of Object.entries(contentById)) {
    await page.route(`**/content/articles/${articleId}.json`, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(content) });
    });
  }

  await page.route("**/content/articles/index.json", (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ articles }) });
  });

  await page.route("**/api/articles/*/archive", (route) => {
    const articleId = route.request().url().match(/articles\/([0-9a-f]{64})\/archive/)![1];
    const entry = articles.find((a) => a.articleId === articleId);
    if (entry) entry.archived = true;
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { articleId, archived: true } }),
    });
  });

  await page.route("**/api/articles/*/unarchive", (route) => {
    const articleId = route.request().url().match(/articles\/([0-9a-f]{64})\/unarchive/)![1];
    const entry = articles.find((a) => a.articleId === articleId);
    if (entry) entry.archived = false;
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { articleId, archived: false } }),
    });
  });
}

test("archiving a card removes it from the default grid, reveals it under 'Show archived', and unarchiving restores it", async ({
  page,
}) => {
  await page.goto("/login");
  await seedAuth(page);
  await mockUserIndex(page, []);
  await setupStatefulArchiveMocks(page, [ARTICLE_A_ENTRY, ARTICLE_B_ENTRY], { [ARTICLE_A_ID]: ARTICLE_A_CONTENT });

  await page.goto("/articles");

  await expect(page.getByText("Faith in Jesus Christ")).toBeVisible();
  await expect(page.getByText("The Living Christ")).toBeVisible();

  // Archive "Faith in Jesus Christ" — it's the first card in the (unsorted-by-this-mock) grid
  await page.getByRole("button", { name: "Archive" }).first().click();

  await expect(page.getByText("Faith in Jesus Christ")).not.toBeVisible();
  await expect(page.getByText("The Living Christ")).toBeVisible();

  // Reveal it under "Show archived"
  await page.getByLabel("Show archived").check();
  await expect(page.getByText("Faith in Jesus Christ")).toBeVisible();
  await expect(page.getByText("The Living Christ")).not.toBeVisible();

  // Unarchive it — restores to the default view
  await page.getByRole("button", { name: "Unarchive" }).click();
  await expect(page.getByText("No archived articles.")).toBeVisible();

  await page.getByLabel("Show archived").uncheck();
  await expect(page.getByText("Faith in Jesus Christ")).toBeVisible();
  await expect(page.getByText("The Living Christ")).toBeVisible();
});

test("archiving from the article view page updates the button in place without navigating", async ({
  page,
}) => {
  await page.goto("/login");
  await seedAuth(page);
  await mockUserIndex(page, []);
  await setupStatefulArchiveMocks(page, [ARTICLE_A_ENTRY], { [ARTICLE_A_ID]: ARTICLE_A_CONTENT });

  await page.goto(`/articles/${ARTICLE_A_ID}`);

  await expect(page.getByRole("button", { name: "Archive" })).toBeVisible();
  await page.getByRole("button", { name: "Archive" }).click();

  await expect(page.getByRole("button", { name: "Unarchive" })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/articles/${ARTICLE_A_ID}$`));
  // Content stays rendered throughout
  await expect(page.getByText("Faith is the first principle of the gospel of Jesus Christ.")).toBeVisible();

  await page.getByRole("button", { name: "Unarchive" }).click();
  await expect(page.getByRole("button", { name: "Archive" })).toBeVisible();
});

test("a past-entry view of an archived article still renders its content", async ({ page }) => {
  await page.goto("/login");
  await seedAuth(page);
  await mockUserIndex(page, []);
  await setupStatefulArchiveMocks(page, [{ ...ARTICLE_A_ENTRY, archived: true }], {
    [ARTICLE_A_ID]: ARTICLE_A_CONTENT,
  });

  await page.goto(`/articles/${ARTICLE_A_ID}?entry-date=2026-04-25`);

  await expect(page.getByText("Faith in Jesus Christ")).toBeVisible();
  await expect(page.getByText("Faith is the first principle of the gospel of Jesus Christ.")).toBeVisible();
  await expect(page.getByText(/Past Entry/i)).toBeVisible();
});
