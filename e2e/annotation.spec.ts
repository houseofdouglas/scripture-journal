import { test, expect } from "@playwright/test";
import { seedAuth } from "./helpers/auth";
import { mockScriptureManifest, mockScriptureChapter, mockAnnotateSuccess, mockAnnotateFailure } from "./helpers/mocks";

const CHAPTER_URL = "/scripture/book-of-mormon/alma/32";

test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await seedAuth(page);
  await mockScriptureManifest(page);
  await mockScriptureChapter(page);
});

// ---------------------------------------------------------------------------

test("hovering a verse reveals a + button", async ({ page }) => {
  await page.goto(CHAPTER_URL);

  const verse = page.locator("[data-verse]").first();
  await verse.hover();

  await expect(verse.getByRole("button", { name: /\+|add note/i })).toBeVisible();
});

test("clicking + opens the inline editor (textarea visible)", async ({
  page,
}) => {
  await page.goto(CHAPTER_URL);

  const verse = page.locator("[data-verse]").first();
  await verse.hover();
  await verse.getByRole("button", { name: /\+|add note/i }).click();

  await expect(page.getByRole("textbox")).toBeVisible();
});

test("clicking Cancel closes the editor", async ({ page }) => {
  await page.goto(CHAPTER_URL);

  const verse = page.locator("[data-verse]").first();
  await verse.hover();
  await verse.getByRole("button", { name: /\+|add note/i }).click();

  await page.getByRole("button", { name: /cancel/i }).click();

  await expect(page.getByRole("textbox")).not.toBeVisible();
});

test("clicking a second + while an editor is open does nothing (only one editor open)", async ({
  page,
}) => {
  await page.goto(CHAPTER_URL);

  const verses = page.locator("[data-verse]");

  // Open editor on first verse
  const verse1 = verses.nth(0);
  await verse1.hover();
  await verse1.getByRole("button", { name: /\+|add note/i }).click();
  await expect(page.getByRole("textbox")).toBeVisible();

  // Attempt to open editor on second verse
  const verse2 = verses.nth(1);
  await verse2.hover();
  const addBtn2 = verse2.getByRole("button", { name: /\+|add note/i });
  // Button may be hidden/disabled when an editor is already open
  const isVisible = await addBtn2.isVisible();
  if (isVisible) {
    await addBtn2.click();
  }

  // Still only one textarea
  await expect(page.getByRole("textbox")).toHaveCount(1);
});

test("typing a note and clicking Save Note calls POST /entries/annotate and shows saved note", async ({
  page,
}) => {
  await mockAnnotateSuccess(page, {
    annotation: {
      blockId: 1,
      text: "My saved note about this verse.",
      createdAt: new Date().toISOString(),
    },
  });

  await page.goto(CHAPTER_URL);

  const verse = page.locator("[data-verse]").first();
  await verse.hover();
  await verse.getByRole("button", { name: /\+|add note/i }).click();

  await page.getByRole("textbox").fill("My saved note about this verse.");
  await page.getByRole("button", { name: /save note/i }).click();

  // Saved note text should appear in the UI
  await expect(
    page.getByText(/my saved note about this verse/i),
  ).toBeVisible();
});

test("on 5xx, inline error strip appears with Could not save and Retry button; text is preserved", async ({
  page,
}) => {
  await mockAnnotateFailure(page, 500);

  await page.goto(CHAPTER_URL);

  const verse = page.locator("[data-verse]").first();
  await verse.hover();
  await verse.getByRole("button", { name: /\+|add note/i }).click();

  await page.getByRole("textbox").fill("Important note text");
  await page.getByRole("button", { name: /save note/i }).click();

  await expect(page.getByText(/could not save/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /retry/i })).toBeVisible();

  // Text must be preserved in the textarea
  await expect(page.getByRole("textbox")).toHaveValue("Important note text");
});

test("on 401 during save, sessionStorage pendingNote is set", async ({
  page,
}) => {
  await mockAnnotateFailure(page, 401);

  await page.goto(CHAPTER_URL);

  const verse = page.locator("[data-verse]").first();
  await verse.hover();
  await verse.getByRole("button", { name: /\+|add note/i }).click();

  await page.getByRole("textbox").fill("Note that should be saved for later");
  await page.getByRole("button", { name: /save note/i }).click();

  // Give the app time to react to the 401
  await page.waitForTimeout(500);

  const pending = await page.evaluate(() =>
    sessionStorage.getItem("pendingNote"),
  );
  expect(pending).not.toBeNull();
});
