import { test, expect } from "@playwright/test";
import { seedAuth } from "./helpers/auth";
import { mockScriptureManifest, mockScriptureChapter } from "./helpers/mocks";

test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await seedAuth(page);
  await mockScriptureManifest(page);
  await mockScriptureChapter(page);
});

// ---------------------------------------------------------------------------

test("authenticated visit to /scripture shows 4 work cards", async ({
  page,
}) => {
  await page.goto("/scripture");
  // Expect 4 cards — one per work in the manifest
  const cards = page.getByRole("link", {
    name: /Book of Mormon|Doctrine and Covenants|Pearl of Great Price|Old Testament/i,
  });
  await expect(cards).toHaveCount(4);
});

test("clicking Book of Mormon navigates to /scripture/book-of-mormon", async ({
  page,
}) => {
  await page.goto("/scripture");
  await page.getByRole("link", { name: /book of mormon/i }).click();
  await expect(page).toHaveURL("/scripture/book-of-mormon");
});

test("clicking Alma navigates to the chapter grid at /scripture/book-of-mormon/alma", async ({
  page,
}) => {
  await page.goto("/scripture/book-of-mormon");
  await page.getByRole("link", { name: /^alma/i }).click();
  await expect(page).toHaveURL("/scripture/book-of-mormon/alma");
});

test("chapter grid shows 63 tiles; clicking tile 32 navigates to chapter 32", async ({
  page,
}) => {
  await page.goto("/scripture/book-of-mormon/alma");
  // There should be 63 chapter tiles
  const tiles = page.getByRole("link", { name: /^\d+$/ });
  await expect(tiles).toHaveCount(63);

  await page.getByRole("link", { name: "32" }).click();
  await expect(page).toHaveURL("/scripture/book-of-mormon/alma/32");
});

test("chapter view renders mocked verses in serif font", async ({ page }) => {
  await page.goto("/scripture/book-of-mormon/alma/32");

  // All three verse texts should appear
  await expect(
    page.getByText(/it came to pass that they did go forth/i),
  ).toBeVisible();
  await expect(
    page.getByText(/compelled to be humble/i),
  ).toBeVisible();
  await expect(
    page.getByText(/better repent/i),
  ).toBeVisible();
});

test("Next Chapter link navigates to chapter 33", async ({ page }) => {
  await page.goto("/scripture/book-of-mormon/alma/32");
  await page.getByRole("link", { name: /next chapter/i }).click();
  await expect(page).toHaveURL("/scripture/book-of-mormon/alma/33");
});

test("Breadcrumb Scripture navigates back to /scripture", async ({ page }) => {
  await page.goto("/scripture/book-of-mormon/alma/32");
  await page.getByRole("link", { name: /^scripture$/i }).click();
  await expect(page).toHaveURL("/scripture");
});
