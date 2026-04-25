import { test, expect } from "@playwright/test";
import { seedAuth } from "./helpers/auth";
import {
  mockImportSuccess,
  mockImportDuplicate,
  mockImportNewVersion,
  mockImportVersionSuccess,
  mockImportDomainError,
  mockImportFetchFailure,
} from "./helpers/mocks";

// Helper to open the import modal
async function openImportModal(page: any) {
  await page.goto("/");
  await page.getByRole("button", { name: /menu/i }).click();
  await page.getByRole("button", { name: /import article/i }).click();
}

// ---------------------------------------------------------------------------
// Domain restrictions tests
// ---------------------------------------------------------------------------

test("domain not in allowlist shows error", async ({ page }) => {
  await page.goto("/login");
  await seedAuth(page);
  await mockImportDomainError(page);

  await openImportModal(page);

  await page.getByLabel(/article url/i).fill("https://example.com/article");
  await page.getByRole("button", { name: /import/i }).click();

  await expect(page.getByText(/domain not allowed/i)).toBeVisible();
});

test("error message displays specific domain restriction", async ({ page }) => {
  await page.goto("/login");
  await seedAuth(page);
  await mockImportDomainError(page);

  await openImportModal(page);

  await page.getByLabel(/article url/i).fill("https://example.com/article");
  await page.getByRole("button", { name: /import/i }).click();

  await expect(page.getByText(/domain not in allowlist/i)).toBeVisible();
});

// ---------------------------------------------------------------------------
// Fetch failure tests
// ---------------------------------------------------------------------------

test("network timeout shows fetch failed message", async ({ page }) => {
  await page.goto("/login");
  await seedAuth(page);
  await mockImportFetchFailure(page);

  await openImportModal(page);

  await page.getByLabel(/article url/i).fill("https://www.churchofjesuschrist.org/article");
  await page.getByRole("button", { name: /import/i }).click();

  await expect(page.getByText(/could not fetch the article/i)).toBeVisible();
});

test("paste article text manually link available", async ({ page }) => {
  await page.goto("/login");
  await seedAuth(page);
  await mockImportFetchFailure(page);

  await openImportModal(page);

  await page.getByLabel(/article url/i).fill("https://www.churchofjesuschrist.org/article");
  await page.getByRole("button", { name: /import/i }).click();

  await expect(page.getByText(/paste article text manually instead/i)).toBeVisible();
});

test("clicking manual paste link switches to manual mode", async ({ page }) => {
  await page.goto("/login");
  await seedAuth(page);
  await mockImportFetchFailure(page);

  await openImportModal(page);

  await page.getByLabel(/article url/i).fill("https://www.churchofjesuschrist.org/article");
  await page.getByRole("button", { name: /import/i }).click();
  await page.getByText(/paste article text manually instead/i).click();

  await expect(page.getByLabel(/article title/i)).toBeVisible();
  await expect(page.getByLabel(/article text/i)).toBeVisible();
});

// ---------------------------------------------------------------------------
// Duplicate detection tests
// ---------------------------------------------------------------------------

test("duplicate article shows already imported modal", async ({ page }) => {
  await page.goto("/login");
  await seedAuth(page);
  await mockImportDuplicate(
    page,
    "article-duplicate-123",
    "Genesis Chapter 1",
    "2026-04-15T10:30:00.000Z",
  );

  await openImportModal(page);

  await page.getByLabel(/article url/i).fill("https://www.churchofjesuschrist.org/genesis/1");
  await page.getByRole("button", { name: /import/i }).click();

  await expect(page.getByText(/already imported/i)).toBeVisible();
});

test("open existing button navigates to article", async ({ page }) => {
  await page.goto("/login");
  await seedAuth(page);
  await mockImportDuplicate(
    page,
    "article-duplicate-123",
    "Genesis Chapter 1",
    "2026-04-15T10:30:00.000Z",
  );

  await openImportModal(page);

  await page.getByLabel(/article url/i).fill("https://www.churchofjesuschrist.org/genesis/1");
  await page.getByRole("button", { name: /import/i }).click();

  await page.getByRole("button", { name: /open existing/i }).click();

  await expect(page).toHaveURL("/articles/article-duplicate-123");
});

test("cancel button closes modal", async ({ page }) => {
  await page.goto("/login");
  await seedAuth(page);
  await mockImportDuplicate(
    page,
    "article-duplicate-123",
    "Genesis Chapter 1",
    "2026-04-15T10:30:00.000Z",
  );

  await openImportModal(page);

  await page.getByLabel(/article url/i).fill("https://www.churchofjesuschrist.org/genesis/1");
  await page.getByRole("button", { name: /import/i }).click();

  await page.getByRole("button", { name: /cancel/i }).click();

  await expect(page.getByText(/import article/i)).not.toBeVisible();
});

// ---------------------------------------------------------------------------
// New version detection tests
// ---------------------------------------------------------------------------

test("updated article shows new version modal", async ({ page }) => {
  await page.goto("/login");
  await seedAuth(page);
  await mockImportNewVersion(
    page,
    "https://www.churchofjesuschrist.org/genesis/1",
    "article-previous-123",
    "2026-04-10T10:30:00.000Z",
    "Genesis Chapter 1",
  );

  await openImportModal(page);

  await page.getByLabel(/article url/i).fill("https://www.churchofjesuschrist.org/genesis/1");
  await page.getByRole("button", { name: /import/i }).click();

  await expect(page.getByText(/updated article detected/i)).toBeVisible();
});

test("shows previous import date", async ({ page }) => {
  await page.goto("/login");
  await seedAuth(page);
  await mockImportNewVersion(
    page,
    "https://www.churchofjesuschrist.org/genesis/1",
    "article-previous-123",
    "2026-04-10T10:30:00.000Z",
    "Genesis Chapter 1",
  );

  await openImportModal(page);

  await page.getByLabel(/article url/i).fill("https://www.churchofjesuschrist.org/genesis/1");
  await page.getByRole("button", { name: /import/i }).click();

  await expect(page.getByText(/april 10, 2026/i)).toBeVisible();
});

test("informs user annotations preserved", async ({ page }) => {
  await page.goto("/login");
  await seedAuth(page);
  await mockImportNewVersion(
    page,
    "https://www.churchofjesuschrist.org/genesis/1",
    "article-previous-123",
    "2026-04-10T10:30:00.000Z",
    "Genesis Chapter 1",
  );

  await openImportModal(page);

  await page.getByLabel(/article url/i).fill("https://www.churchofjesuschrist.org/genesis/1");
  await page.getByRole("button", { name: /import/i }).click();

  await expect(
    page.getByText(/your previous annotations are preserved on the prior version/i),
  ).toBeVisible();
});

test("create new version button works", async ({ page }) => {
  await page.goto("/login");
  await seedAuth(page);
  await mockImportVersionSuccess(
    page,
    "article-new-version-456",
    "Genesis Chapter 1",
    "article-previous-123",
    "2026-04-20T10:30:00.000Z",
  );

  await openImportModal(page);

  await page.getByLabel(/article url/i).fill("https://www.churchofjesuschrist.org/genesis/1");
  await page.getByRole("button", { name: /import/i }).click();

  await page.getByRole("button", { name: /create new version/i }).click();

  await expect(page).toHaveURL("/articles/article-new-version-456");
});

test("open previous version button works", async ({ page }) => {
  await page.goto("/login");
  await seedAuth(page);
  await mockImportNewVersion(
    page,
    "https://www.churchofjesuschrist.org/genesis/1",
    "article-previous-123",
    "2026-04-10T10:30:00.000Z",
    "Genesis Chapter 1",
  );

  await openImportModal(page);

  await page.getByLabel(/article url/i).fill("https://www.churchofjesuschrist.org/genesis/1");
  await page.getByRole("button", { name: /import/i }).click();

  await page.getByRole("button", { name: /open previous version/i }).click();

  await expect(page).toHaveURL("/articles/article-previous-123");
});

test("cancel button closes modal new version", async ({ page }) => {
  await page.goto("/login");
  await seedAuth(page);
  await mockImportNewVersion(
    page,
    "https://www.churchofjesuschrist.org/genesis/1",
    "article-previous-123",
    "2026-04-10T10:30:00.000Z",
    "Genesis Chapter 1",
  );

  await openImportModal(page);

  await page.getByLabel(/article url/i).fill("https://www.churchofjesuschrist.org/genesis/1");
  await page.getByRole("button", { name: /import/i }).click();

  await page.getByRole("button", { name: /cancel/i }).click();

  await expect(page.getByText(/import article/i)).not.toBeVisible();
});
