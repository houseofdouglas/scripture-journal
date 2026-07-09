import { describe, it, expect, vi, beforeEach } from "vitest";
import fixture from "./fixtures/textract-strategy-article.json";
import type { Block, BlockType } from "@aws-sdk/client-textract";

vi.mock("../../repository/tmp-upload", () => ({
  headTmpObject: vi.fn(),
  readTmpObjectPrefix: vi.fn(),
  deleteTmpObject: vi.fn(),
}));
vi.mock("../../repository/textract", () => ({
  analyzeDocumentLayout: vi.fn(),
}));

import * as tmpUpload from "../../repository/tmp-upload";
import * as textractRepo from "../../repository/textract";
import { extractPdf } from "../pdf-extract";
import { ValidationError } from "../errors";
import { ExtractionFailedError } from "../../repository/errors";

const mockHeadTmpObject = vi.mocked(tmpUpload.headTmpObject);
const mockReadTmpObjectPrefix = vi.mocked(tmpUpload.readTmpObjectPrefix);
const mockDeleteTmpObject = vi.mocked(tmpUpload.deleteTmpObject);
const mockAnalyzeDocumentLayout = vi.mocked(textractRepo.analyzeDocumentLayout);

const KEY = "tmp/extract/550e8400-e29b-41d4-a716-446655440000.pdf";
const PDF_MAGIC = Buffer.from("%PDF-");

function stubValidUpload(): void {
  mockHeadTmpObject.mockResolvedValue(1_000_000);
  mockReadTmpObjectPrefix.mockResolvedValue(PDF_MAGIC);
  mockDeleteTmpObject.mockResolvedValue(undefined);
}

describe("extractPdf() — reference document fixture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubValidUpload();
    mockAnalyzeDocumentLayout.mockResolvedValue({
      blocks: fixture.Blocks as Block[],
      pageCount: fixture.DocumentMetadata.Pages,
    });
  });

  it("produces a substantial set of paragraphs with no figure-label leakage", async () => {
    const result = await extractPdf(KEY);

    expect(result.paragraphs.length).toBeGreaterThan(50);
    expect(result.paragraphs.some((p) => p.includes("TARGET CUSTOMER"))).toBe(false);
    expect(result.paragraphs.some((p) => p.includes("PRICE one-time commission"))).toBe(false);
  });

  it("never interleaves text from adjacent two-column blocks (regression check against the old pdf.js extractor's bug)", async () => {
    const result = await extractPdf(KEY);

    // The old line-position-based extractor spliced "Should I cut the price
    // for this customer?" (left column) directly into "a strategy statement
    // are, which makes it..." (right column, a different block entirely),
    // producing the artifact "customer?a strategy statement are". Textract's
    // block-based Layout output keeps these as fully separate blocks, and
    // the terminal "?" correctly blocks continuation-merge from joining them.
    expect(result.paragraphs.some((p) => p.includes("customer?a strategy"))).toBe(false);

    const quoteIndex = result.paragraphs.findIndex((p) =>
      p.startsWith('"Should I cut the price for this customer?')
    );
    const bioIndex = result.paragraphs.findIndex((p) => p.startsWith("David J. Collis (dcollis@hbs.edu)"));
    expect(quoteIndex).toBeGreaterThanOrEqual(0);
    expect(bioIndex).toBeGreaterThanOrEqual(0);
    // Distinct paragraphs — neither swallowed the other's text.
    expect(result.paragraphs[quoteIndex]).not.toContain("David J. Collis");
    expect(result.paragraphs[bioIndex]).not.toContain("Should I cut the price");
  });

  it("drops running-footer and page-number boilerplate entirely (LAYOUT_FOOTER/LAYOUT_PAGE_NUMBER)", async () => {
    const result = await extractPdf(KEY);

    expect(result.paragraphs.some((p) => p.includes("HARVARD BUSINESS REVIEW APRIL 2008"))).toBe(false);
    expect(result.paragraphs.some((p) => /^PAGE \d+$/.test(p.trim()))).toBe(false);
  });

  it("keeps section headers as standalone paragraphs", async () => {
    const result = await extractPdf(KEY);

    expect(result.paragraphs).toContain("Elements of a Strategy Statement");
    expect(result.paragraphs).toContain("Defining the Objective");
  });

  it("dehyphenates a word split across a line break", async () => {
    const result = await extractPdf(KEY);

    expect(result.paragraphs.some((p) => p.includes("colleagues"))).toBe(true);
    expect(result.paragraphs.some((p) => p.includes("col- leagues"))).toBe(false);
  });

  it("returns the first title block as suggestedTitle and the correct pageCount", async () => {
    const result = await extractPdf(KEY);

    expect(result.suggestedTitle).toBe("Can You Say What Your Strategy Is?");
    expect(result.pageCount).toBe(11);
  });

  it("deletes the tmp object after a successful extraction", async () => {
    await extractPdf(KEY);
    expect(mockDeleteTmpObject).toHaveBeenCalledWith(KEY);
  });

  it("moves an embedded sidebar out of the main flow and reconnects the split body sentence (live bug: Wal-Mart sidebar, p6)", async () => {
    const result = await extractPdf(KEY);

    // On p6 the Wal-Mart callout box (2-column-wide, plus its figure/table
    // labels) sits physically between the two halves of a continuous body
    // sentence: "…Nor will" | [sidebar] | "the company offer penny stocks…".
    // Textract's linear order interleaves them; the geometry pass drops the
    // figure labels and moves the wide sidebar to the page's end, so the two
    // body halves fall adjacent and re-merge into one paragraph.
    expect(result.paragraphs.some((p) => /Nor will the company offer penny stocks/.test(p))).toBe(true);

    // The figure/table labels around the Wal-Mart comparison are dropped, not
    // emitted as stray paragraphs.
    expect(result.paragraphs).not.toContain("Source: Jan Rivkin, Harvard Business School");
    expect(result.paragraphs.some((p) => p.startsWith("Customer purchase criteria"))).toBe(false);
    expect(result.paragraphs.some((p) => p.startsWith("Delivery on criteria"))).toBe(false);

    // The sidebar's own prose is preserved (moved to the end of the page),
    // and its header travels with it rather than orphaning at the top.
    const walmartHeader = result.paragraphs.indexOf("Wal-Mart's Value Proposition");
    const walmartBody = result.paragraphs.findIndex((p) => p.startsWith("Wal-Mart's value proposition can be summed up"));
    expect(walmartHeader).toBeGreaterThanOrEqual(0);
    expect(walmartBody).toBe(walmartHeader + 1);
    // The sidebar comes after the main body sentence it was interrupting.
    const continuation = result.paragraphs.findIndex((p) => /Nor will the company offer penny stocks/.test(p));
    expect(walmartHeader).toBeGreaterThan(continuation);
  });

  it("still merges a long paragraph ending in a capitalized mid-sentence word across a page boundary", async () => {
    const result = await extractPdf(KEY);

    // p3 ends "…the essence of your strategy: What" (346 chars, final word
    // capitalized) and p4 continues "your business will do differently…" —
    // a legit continuation the final-word-lowercase rule alone would miss;
    // covered by the long-block branch.
    expect(
      result.paragraphs.some((p) => p.includes("your strategy: What your business will do differently"))
    ).toBe(true);
  });

  it("does not glue short figure text or masthead fragments to following body text", async () => {
    const result = await extractPdf(KEY);

    // p4's figure text "OBJECTIVE = Ends SCOPE = Domain ADVANTAGE = Means"
    // (49 chars, no terminal punctuation) precedes body text starting
    // lowercase — short ambiguous blocks must never merge.
    expect(result.paragraphs.some((p) => p.includes("ADVANTAGE = Means form or other"))).toBe(false);
  });
});

// ── Synthetic-block builders ─────────────────────────────────────────────────
// The big fixture proves the real pipeline is sound, but pinning an exact
// merge/no-merge outcome to real messy prose is fragile. These build minimal
// Textract-shaped blocks to test mergeContinuations()'s two rules in
// isolation, via the public extractPdf() entry point.

let nextId = 0;
function id(): string {
  return `b${nextId++}`;
}

function lineBlock(text: string): Block {
  return { Id: id(), BlockType: "LINE", Text: text };
}

function layoutBlock(blockType: BlockType, lines: Block[], box?: { l: number; t: number; w: number; h: number }): Block {
  return {
    Id: id(),
    BlockType: blockType,
    Relationships: [{ Type: "CHILD", Ids: lines.map((l) => l.Id!) }],
    ...(box ? { Geometry: { BoundingBox: { Left: box.l, Top: box.t, Width: box.w, Height: box.h } } } : {}),
  };
}

/** A figure/table block occupying a bounding box (no text children). */
function figureBlock(box: { l: number; t: number; w: number; h: number }): Block {
  return {
    Id: id(),
    BlockType: "LAYOUT_FIGURE",
    Geometry: { BoundingBox: { Left: box.l, Top: box.t, Width: box.w, Height: box.h } },
  };
}

function pageBlock(pageNum: number, children: Block[]): Block {
  return {
    Id: id(),
    BlockType: "PAGE",
    Page: pageNum,
    Relationships: [{ Type: "CHILD", Ids: children.map((c) => c.Id!) }],
  };
}

describe("extractPdf() — continuation merge (synthetic blocks)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubValidUpload();
    nextId = 0;
  });

  it("merges a sentence split across a page boundary", async () => {
    const l1 = lineBlock("This sentence continues");
    const t1 = layoutBlock("LAYOUT_TEXT", [l1]);
    const l2 = lineBlock("onto the next page.");
    const t2 = layoutBlock("LAYOUT_TEXT", [l2]);
    const blocks: Block[] = [l1, t1, pageBlock(1, [t1]), l2, t2, pageBlock(2, [t2])];

    mockAnalyzeDocumentLayout.mockResolvedValue({ blocks, pageCount: 2 });

    const result = await extractPdf(KEY);

    expect(result.paragraphs).toEqual(["This sentence continues onto the next page."]);
  });

  it("does not merge a complete sentence into the next paragraph", async () => {
    const l1 = lineBlock("This sentence is complete.");
    const t1 = layoutBlock("LAYOUT_TEXT", [l1]);
    const l2 = lineBlock("A new paragraph begins here.");
    const t2 = layoutBlock("LAYOUT_TEXT", [l2]);
    const blocks: Block[] = [l1, t1, l2, t2, pageBlock(1, [t1, t2])];

    mockAnalyzeDocumentLayout.mockResolvedValue({ blocks, pageCount: 1 });

    const result = await extractPdf(KEY);

    expect(result.paragraphs).toEqual(["This sentence is complete.", "A new paragraph begins here."]);
  });

  it("does not merge a caption ending in a proper noun into lowercase-starting body text", async () => {
    const captionLine = lineBlock("Source: Jan Rivkin, Harvard Business School");
    const caption = layoutBlock("LAYOUT_TEXT", [captionLine]);
    const bodyLine = lineBlock("the company offer penny stocks and options.");
    const body = layoutBlock("LAYOUT_TEXT", [bodyLine]);
    const blocks: Block[] = [captionLine, caption, bodyLine, body, pageBlock(1, [caption, body])];

    mockAnalyzeDocumentLayout.mockResolvedValue({ blocks, pageCount: 1 });

    const result = await extractPdf(KEY);

    expect(result.paragraphs).toEqual([
      "Source: Jan Rivkin, Harvard Business School",
      "the company offer penny stocks and options.",
    ]);
  });

  it("joins a block ending in a line-break hyphen without a space", async () => {
    const l1 = lineBlock("The word is hyphen-");
    const t1 = layoutBlock("LAYOUT_TEXT", [l1]);
    const l2 = lineBlock("ated across a column break.");
    const t2 = layoutBlock("LAYOUT_TEXT", [l2]);
    const blocks: Block[] = [l1, t1, pageBlock(1, [t1]), l2, t2, pageBlock(2, [t2])];

    mockAnalyzeDocumentLayout.mockResolvedValue({ blocks, pageCount: 2 });

    const result = await extractPdf(KEY);

    expect(result.paragraphs).toEqual(["The word is hyphenated across a column break."]);
  });

  it("never merges a heading with adjacent text, even without terminal punctuation", async () => {
    const headingLine = lineBlock("Section Heading Without Punctuation");
    const heading = layoutBlock("LAYOUT_SECTION_HEADER", [headingLine]);
    const bodyLine = lineBlock("lowercase body text follows.");
    const body = layoutBlock("LAYOUT_TEXT", [bodyLine]);
    const blocks: Block[] = [headingLine, heading, bodyLine, body, pageBlock(1, [heading, body])];

    mockAnalyzeDocumentLayout.mockResolvedValue({ blocks, pageCount: 1 });

    const result = await extractPdf(KEY);

    expect(result.paragraphs).toEqual([
      "Section Heading Without Punctuation",
      "lowercase body text follows.",
    ]);
  });
});

describe("extractPdf() — geometry-based reordering (synthetic blocks)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubValidUpload();
    nextId = 0;
  });

  // A page where a wide sidebar sits (in Textract's linear order) between the
  // two halves of a continuous body sentence — the shape of the live p6 bug.
  it("moves a wide sidebar to the page end so the interrupted body sentence reconnects", async () => {
    const a1 = lineBlock("The main body sentence continues");
    const aBlock = layoutBlock("LAYOUT_TEXT", [a1], { l: 0.07, t: 0.1, w: 0.29, h: 0.1 });
    const sHead = lineBlock("Sidebar Heading");
    const sHeadBlock = layoutBlock("LAYOUT_SECTION_HEADER", [sHead], { l: 0.07, t: 0.3, w: 0.3, h: 0.03 });
    const sBody = lineBlock("Sidebar body text that spans two columns.");
    const sBodyBlock = layoutBlock("LAYOUT_TEXT", [sBody], { l: 0.07, t: 0.34, w: 0.52, h: 0.2 });
    const a2 = lineBlock("across the sidebar and finishes here.");
    const a2Block = layoutBlock("LAYOUT_TEXT", [a2], { l: 0.64, t: 0.1, w: 0.29, h: 0.1 });
    // Textract order: main-1, sidebar header, sidebar body, main-2
    const blocks: Block[] = [
      a1, aBlock, sHead, sHeadBlock, sBody, sBodyBlock, a2, a2Block,
      pageBlock(1, [aBlock, sHeadBlock, sBodyBlock, a2Block]),
    ];
    mockAnalyzeDocumentLayout.mockResolvedValue({ blocks, pageCount: 1 });

    const result = await extractPdf(KEY);

    // Body halves reconnect; sidebar (header + body) moved to the end intact.
    expect(result.paragraphs).toEqual([
      "The main body sentence continues across the sidebar and finishes here.",
      "Sidebar Heading",
      "Sidebar body text that spans two columns.",
    ]);
  });

  it("drops a text block that is a label of a figure it overlaps", async () => {
    const bodyLine = lineBlock("Real body paragraph one.");
    const body = layoutBlock("LAYOUT_TEXT", [bodyLine], { l: 0.07, t: 0.1, w: 0.29, h: 0.1 });
    const fig = figureBlock({ l: 0.15, t: 0.4, w: 0.36, h: 0.3 });
    const capLine = lineBlock("Source: Some Attribution");
    const caption = layoutBlock("LAYOUT_TEXT", [capLine], { l: 0.16, t: 0.72, w: 0.16, h: 0.02 });
    const blocks: Block[] = [bodyLine, body, fig, capLine, caption, pageBlock(1, [body, fig, caption])];
    mockAnalyzeDocumentLayout.mockResolvedValue({ blocks, pageCount: 1 });

    const result = await extractPdf(KEY);

    expect(result.paragraphs).toEqual(["Real body paragraph one."]);
  });
});

describe("extractPdf() — validation and error paths", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws ValidationError without deleting when the object is missing", async () => {
    mockHeadTmpObject.mockResolvedValue(null);

    await expect(extractPdf(KEY)).rejects.toThrow(ValidationError);
    expect(mockDeleteTmpObject).not.toHaveBeenCalled();
  });

  it("throws ValidationError and deletes the object when it exceeds 50 MB", async () => {
    mockHeadTmpObject.mockResolvedValue(51 * 1024 * 1024);

    await expect(extractPdf(KEY)).rejects.toThrow(ValidationError);
    expect(mockDeleteTmpObject).toHaveBeenCalledWith(KEY);
  });

  it("throws ValidationError and deletes the object when magic bytes are wrong", async () => {
    mockHeadTmpObject.mockResolvedValue(1000);
    mockReadTmpObjectPrefix.mockResolvedValue(Buffer.from("not-a-pdf"));

    await expect(extractPdf(KEY)).rejects.toThrow(ValidationError);
    expect(mockDeleteTmpObject).toHaveBeenCalledWith(KEY);
  });

  it("throws ExtractionFailedError when zero blocks survive filtering", async () => {
    stubValidUpload();
    mockAnalyzeDocumentLayout.mockResolvedValue({ blocks: [], pageCount: 1 });

    await expect(extractPdf(KEY)).rejects.toThrow(ExtractionFailedError);
  });

  it("deletes the tmp object even when the Textract job throws", async () => {
    stubValidUpload();
    mockAnalyzeDocumentLayout.mockRejectedValue(new Error("Textract job failed"));

    await expect(extractPdf(KEY)).rejects.toThrow("Textract job failed");
    expect(mockDeleteTmpObject).toHaveBeenCalledWith(KEY);
  });
});
