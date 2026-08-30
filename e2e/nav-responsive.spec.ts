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

test("nav does not overflow horizontally at 375px width", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/scripture");

  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
});

test("mobile menu toggle reveals nav links at 375px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/scripture");

  const toggle = page.getByRole("button", { name: /toggle navigation menu/i });
  await expect(toggle).toBeVisible();

  // Center links are collapsed until the menu is toggled open
  await expect(page.getByRole("link", { name: /browse articles/i })).not.toBeVisible();

  await toggle.click();
  await expect(page.getByRole("link", { name: /browse articles/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /import article/i })).toBeVisible();
});

test("desktop layout at 1024px shows nav links inline with no hamburger toggle", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto("/scripture");

  await expect(page.getByRole("button", { name: /toggle navigation menu/i })).not.toBeVisible();
  await expect(page.getByRole("link", { name: /browse scripture/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /browse articles/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /import article/i })).toBeVisible();

  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
});
