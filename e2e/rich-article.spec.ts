import { test, expect, type Page } from "@playwright/test";
import { seedAuth } from "./helpers/auth";
import { RICH_ARTICLE, mockRichArticle, mockUserIndex } from "./helpers/mocks";

/**
 * RAB-21 — E2E coverage for rich article blocks (docs/specs/rich-article-blocks.md
 * FR-17–FR-23): semantic rendering of every block kind, annotation on non-text blocks,
 * 375px containment of wide tables/code, the original-size figure viewer, and the
 * code-block Copy button. Fixture: e2e/fixtures/rich-article.json.
 */

const ARTICLE_URL = `/articles/${RICH_ARTICLE.articleId}`;

/** Block indexes in the fixture. */
const BLOCK = {
  h2: 1,
  h3: 2,
  h4: 3,
  list: 4,
  code: 5,
  table: 6,
  wideSvg: 7,
  smallPng: 8,
  unavailable: 9,
} as const;

const block = (page: Page, index: number) => page.locator(`[data-paragraph-index="${index}"]`);

async function openArticle(page: Page): Promise<void> {
  await page.goto("/login");
  await seedAuth(page);
  await mockUserIndex(page, []);
  await mockRichArticle(page);
  await page.goto(ARTICLE_URL);
  await expect(page.getByRole("heading", { level: 1, name: RICH_ARTICLE.title })).toBeVisible({
    timeout: 15000,
  });
}

// ---------------------------------------------------------------------------

test("renders every block kind with correct semantics", async ({ page }) => {
  await openArticle(page);

  // Headings (FR-17)
  await expect(block(page, BLOCK.h2).locator("h2")).toHaveText("Section Heading Two");
  await expect(block(page, BLOCK.h3).locator("h3")).toHaveText("Subsection Heading Three");
  await expect(block(page, BLOCK.h4).locator("h4")).toHaveText("Minor Heading Four");

  // Ordered list with start=5 and nesting (FR-18)
  const list = block(page, BLOCK.list);
  const topOl = list.locator(":scope ol").first();
  await expect(topOl).toHaveAttribute("start", "5");
  await expect(topOl.locator(":scope > li")).toHaveCount(3);
  await expect(topOl.locator("ol ol > li")).toHaveText("Grandchild A1");

  // Code block (FR-19)
  const code = block(page, BLOCK.code);
  await expect(code.locator("pre > code")).toContainText("veryLongIdentifierName");
  await expect(code.getByTestId("code-language")).toHaveText("typescript");

  // Table (FR-20)
  const table = block(page, BLOCK.table).locator("table");
  await expect(table.locator("thead th")).toHaveCount(9);
  await expect(table.locator("tbody tr")).toHaveCount(3);

  // Figures (FR-22)
  const wideImg = block(page, BLOCK.wideSvg).locator("figure img");
  await expect(wideImg).toHaveAttribute("alt", "Wide architecture diagram");
  await expect(wideImg).toHaveAttribute("src", /^\/content\/assets\/[0-9a-f]{64}\.svg$/);
  await expect(block(page, BLOCK.wideSvg).locator("figcaption")).toHaveText(
    "Figure 1: A wide architecture diagram",
  );
  await expect(block(page, BLOCK.smallPng).locator("figure img")).toHaveAttribute(
    "alt",
    "Small raster thumbnail",
  );

  // Unavailable figure placeholder (FR-13)
  const unavailable = block(page, BLOCK.unavailable);
  await expect(unavailable.locator("img")).toHaveCount(0);
  await expect(
    unavailable.getByRole("img", { name: "Image unavailable: Figure 3: A diagram that failed to import" }),
  ).toBeVisible();
  await expect(unavailable.locator("figcaption")).toHaveText("Figure 3: A diagram that failed to import");
});

test("figure assets load from /content/assets/ with real image bytes", async ({ page }) => {
  await openArticle(page);
  for (const index of [BLOCK.wideSvg, BLOCK.smallPng]) {
    const img = block(page, index).locator("figure img");
    await img.scrollIntoViewIfNeeded();
    await expect
      .poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0))
      .toBe(true);
  }
});

test("heading, list, code, table, and figure blocks can be annotated", async ({ page }) => {
  await openArticle(page);

  const targets: Array<[number, string]> = [
    [BLOCK.h2, "Note on the heading"],
    [BLOCK.list, "Note on the list"],
    [BLOCK.code, "Note on the code block"],
    [BLOCK.table, "Note on the table"],
    [BLOCK.wideSvg, "Note on the figure"],
  ];

  for (const [index, text] of targets) {
    const row = block(page, index);
    await row.scrollIntoViewIfNeeded();
    await row.hover();
    await row.getByRole("button", { name: /add note/i }).click();
    await page.getByRole("textbox").fill(text);
    await page.getByRole("button", { name: /save note/i }).click();
    // Saved note renders inside the annotated block, and the editor closes.
    await expect(row.getByText(text)).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveCount(0);
  }

  await expect(page.getByText("5 notes")).toBeVisible();
});

test.describe("at 375px", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("page has no horizontal overflow; table and code scroll inside their containers", async ({
    page,
  }) => {
    await openArticle(page);

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

    for (const testId of ["table-scroll", "code-scroll"]) {
      const container = page.getByTestId(testId);
      const dims = await container.evaluate((el) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        overflowX: getComputedStyle(el).overflowX,
      }));
      expect(dims.scrollWidth, `${testId} should overflow internally`).toBeGreaterThan(dims.clientWidth);
      expect(dims.overflowX).toBe("auto");
      const box = await container.boundingBox();
      expect(box!.x + box!.width).toBeLessThanOrEqual(375);
    }
  });

  test("wide figure keeps its 4:1 ratio, fits the viewport, and opens at original size", async ({
    page,
  }) => {
    await openArticle(page);

    const figureRow = block(page, BLOCK.wideSvg);
    const img = figureRow.locator("figure img");
    await img.scrollIntoViewIfNeeded();

    const box = (await img.boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(375);
    expect(box.x + box.width).toBeLessThanOrEqual(375);
    expect(Math.abs(box.width / 4 - box.height)).toBeLessThanOrEqual(1);

    const trigger = figureRow.getByRole("button", { name: /view original size/i });
    await expect(trigger).toBeVisible();
    await trigger.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const dialogImg = dialog.locator("img");
    const dialogBox = (await dialogImg.boundingBox())!;
    expect(Math.round(dialogBox.width)).toBe(2400);
    expect(Math.round(dialogBox.height)).toBe(600);

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
});

test.describe("at 1280px", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("small raster renders at intrinsic width (not upscaled) with no original-size button", async ({
    page,
  }) => {
    await openArticle(page);

    const figureRow = block(page, BLOCK.smallPng);
    const img = figureRow.locator("figure img");
    await img.scrollIntoViewIfNeeded();
    await expect(img).toBeVisible();

    const box = (await img.boundingBox())!;
    expect(Math.round(box.width)).toBe(200);
    expect(Math.round(box.height)).toBe(100);
    await expect(figureRow.getByRole("button", { name: /view original size/i })).toHaveCount(0);
  });
});

test.describe("code block copy", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  test("Copy button places the code on the clipboard and shows Copied", async ({ page }) => {
    await openArticle(page);

    const code = block(page, BLOCK.code);
    await code.getByRole("button", { name: "Copy", exact: true }).click();
    await expect(code.getByRole("button", { name: "Copied", exact: true })).toBeVisible();

    const expected = RICH_ARTICLE.paragraphs[BLOCK.code]!.text;
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toBe(expected);
  });
});
