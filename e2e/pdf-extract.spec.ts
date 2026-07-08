import { test, expect, Page } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { seedAuth } from "./helpers/auth";
import {
  mockUserIndex,
  mockImportSuccess,
  mockExtractUploadUrl,
  mockS3Upload,
  mockExtractPdfSuccess,
  mockExtractPdfFailure,
} from "./helpers/mocks";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// A hand-built, genuinely valid single-page PDF (verified against pdfjs-dist
// directly before use) containing the text "Fallback extraction test
// paragraph." — used only by the fallback-path test, where the browser's
// real pdf.js extractor must successfully parse it.
const MINIMAL_PDF_PATH = path.join(__dirname, "fixtures/minimal.pdf");

const UPLOAD_URL = "https://fake-bucket.s3.amazonaws.com/tmp/extract/abc123.pdf?sig=xyz";
const ARTICLE_ID = "a".repeat(64);

async function setupUploadMocks(page: Page): Promise<void> {
  await mockExtractUploadUrl(page, UPLOAD_URL, "tmp/extract/abc123.pdf");
  await mockS3Upload(page, UPLOAD_URL);
}

async function openPdfImport(page: Page): Promise<void> {
  await page.goto("/import");
  await page.getByText("Import a PDF →").click();
}

test("happy path: cloud extraction shows a preview then imports the article", async ({ page }) => {
  await page.goto("/login");
  await seedAuth(page);
  await mockUserIndex(page, []);
  await setupUploadMocks(page);
  await mockExtractPdfSuccess(page, {
    paragraphs: ["Cloud paragraph one.", "Cloud paragraph two."],
    suggestedTitle: "Cloud Title",
    pageCount: 2,
  });
  await mockImportSuccess(page, ARTICLE_ID, "Cloud Title", "2026-01-01T00:00:00.000Z");

  await openPdfImport(page);
  await page.getByLabel("PDF file").setInputFiles(MINIMAL_PDF_PATH);

  await expect(page.getByLabel("Title")).toHaveValue("Cloud Title");
  await expect(page.getByText("Cloud paragraph one.")).toBeVisible();
  await expect(page.getByText("Cloud paragraph two.")).toBeVisible();
  await expect(page.getByText(/Cloud extraction unavailable/)).not.toBeVisible();

  await page.getByRole("button", { name: "Import" }).click();
  await expect(page).toHaveURL(new RegExp(`/articles/${ARTICLE_ID}$`));
});

test("fallback path: cloud extraction fails and the app falls back to local pdf.js extraction", async ({
  page,
}) => {
  await page.goto("/login");
  await seedAuth(page);
  await mockUserIndex(page, []);
  await setupUploadMocks(page);
  await mockExtractPdfFailure(page);

  await openPdfImport(page);
  await page.getByLabel("PDF file").setInputFiles(MINIMAL_PDF_PATH);

  await expect(page.getByText(/Cloud extraction unavailable — used local extraction\./)).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("Fallback extraction test paragraph.")).toBeVisible();
});

test("cancelling the preview creates no article and returns to the URL step", async ({ page }) => {
  await page.goto("/login");
  await seedAuth(page);
  await mockUserIndex(page, []);
  await setupUploadMocks(page);
  await mockExtractPdfSuccess(page, {
    paragraphs: ["Some paragraph text."],
    suggestedTitle: "Some Title",
    pageCount: 1,
  });

  let importCalled = false;
  await page.route("**/api/articles/import", (route) => {
    importCalled = true;
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await openPdfImport(page);
  await page.getByLabel("PDF file").setInputFiles(MINIMAL_PDF_PATH);
  await expect(page.getByLabel("Title")).toHaveValue("Some Title");

  await page.getByRole("button", { name: "Cancel" }).click();

  await expect(page.getByLabel("Article URL")).toBeVisible();
  expect(importCalled).toBe(false);
});
