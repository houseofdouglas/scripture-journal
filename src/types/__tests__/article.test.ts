import { describe, it, expect } from "vitest";
import {
  ASSET_KEY_PATTERN,
  ArticleIndexEntrySchema,
  ArticleParagraphSchema,
  ArticleSchema,
  assetKey,
  type FigurePayload,
  type ListItem,
  ExtractUploadUrlResponseSchema,
  ExtractPdfRequestSchema,
  ExtractPdfResponseSchema,
  buildExtractTmpKey,
} from "../article";

const VALID_ARTICLE_ID = "a".repeat(64);

const BASE_ENTRY = {
  articleId: VALID_ARTICLE_ID,
  title: "Faith in Jesus Christ",
  sourceUrl: "https://churchofjesuschrist.org/study/manual/faith",
  importedAt: "2026-04-22T10:00:00.000Z",
};

describe("ArticleIndexEntrySchema — archived field", () => {
  it("defaults archived to false when the key is missing (pre-existing index entries)", () => {
    const parsed = ArticleIndexEntrySchema.parse(BASE_ENTRY);
    expect(parsed.archived).toBe(false);
  });

  it("preserves archived: true when present", () => {
    const parsed = ArticleIndexEntrySchema.parse({ ...BASE_ENTRY, archived: true });
    expect(parsed.archived).toBe(true);
  });

  it("preserves archived: false when explicitly present", () => {
    const parsed = ArticleIndexEntrySchema.parse({ ...BASE_ENTRY, archived: false });
    expect(parsed.archived).toBe(false);
  });
});

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";
const VALID_KEY = buildExtractTmpKey(VALID_UUID);

describe("buildExtractTmpKey()", () => {
  it("produces a key matching the tmp/extract/<uuid>.pdf pattern", () => {
    expect(VALID_KEY).toBe(`tmp/extract/${VALID_UUID}.pdf`);
    expect(() => ExtractPdfRequestSchema.parse({ key: VALID_KEY, filename: "a.pdf" })).not.toThrow();
  });
});

describe("ExtractUploadUrlResponseSchema", () => {
  it("accepts a valid presigned URL and tmp key", () => {
    const parsed = ExtractUploadUrlResponseSchema.parse({
      uploadUrl: "https://bucket.s3.amazonaws.com/tmp/extract/x?signature=abc",
      key: VALID_KEY,
    });
    expect(parsed.key).toBe(VALID_KEY);
  });

  it("rejects a key outside tmp/extract/", () => {
    expect(() =>
      ExtractUploadUrlResponseSchema.parse({
        uploadUrl: "https://bucket.s3.amazonaws.com/x",
        key: "content/articles/index.json",
      })
    ).toThrow();
  });
});

describe("ExtractPdfRequestSchema", () => {
  it("accepts a valid tmp/extract key", () => {
    const parsed = ExtractPdfRequestSchema.parse({ key: VALID_KEY, filename: "report.pdf" });
    expect(parsed.key).toBe(VALID_KEY);
  });

  it("rejects a key with path traversal", () => {
    expect(() =>
      ExtractPdfRequestSchema.parse({ key: "tmp/extract/../../etc/passwd.pdf", filename: "x.pdf" })
    ).toThrow();
  });

  it("rejects a key with the wrong extension", () => {
    expect(() =>
      ExtractPdfRequestSchema.parse({ key: `tmp/extract/${VALID_UUID}.json`, filename: "x.pdf" })
    ).toThrow();
  });

  it("rejects a malformed uuid segment", () => {
    expect(() =>
      ExtractPdfRequestSchema.parse({ key: "tmp/extract/not-a-uuid.pdf", filename: "x.pdf" })
    ).toThrow();
  });

  it("rejects a missing filename", () => {
    expect(() => ExtractPdfRequestSchema.parse({ key: VALID_KEY, filename: "" })).toThrow();
  });
});

describe("ExtractPdfResponseSchema", () => {
  it("accepts a valid response with a suggested title", () => {
    const parsed = ExtractPdfResponseSchema.parse({
      paragraphs: ["First paragraph.", "Second paragraph."],
      suggestedTitle: "My Article",
      pageCount: 3,
    });
    expect(parsed.paragraphs).toHaveLength(2);
  });

  it("accepts a null suggestedTitle", () => {
    const parsed = ExtractPdfResponseSchema.parse({
      paragraphs: ["Only paragraph."],
      suggestedTitle: null,
      pageCount: 1,
    });
    expect(parsed.suggestedTitle).toBeNull();
  });

  it("rejects an empty paragraphs array", () => {
    expect(() =>
      ExtractPdfResponseSchema.parse({ paragraphs: [], suggestedTitle: null, pageCount: 1 })
    ).toThrow();
  });

  it("rejects a non-positive pageCount", () => {
    expect(() =>
      ExtractPdfResponseSchema.parse({ paragraphs: ["text"], suggestedTitle: null, pageCount: 0 })
    ).toThrow();
  });
});

// ── Rich article blocks (RAB-02) ──────────────────────────────────────────────

const SHA = "0123456789abcdef".repeat(4);
const FIGURE_KEY = assetKey(SHA, "svg");

const AVAILABLE_FIGURE: FigurePayload = {
  assetKey: FIGURE_KEY,
  format: "svg",
  width: 2400,
  height: 600,
  alt: "Diagram",
  caption: "The SDLC loop",
};

const UNAVAILABLE_FIGURE: FigurePayload = {
  assetKey: null,
  format: null,
  width: null,
  height: null,
  alt: "Diagram",
  caption: "The SDLC loop",
  unavailable: true,
};

const PAYLOADS = {
  heading: { level: 2 },
  list: { ordered: true, start: 5, items: [{ text: "one" }, { text: "two", children: [{ text: "two.a" }] }] },
  code: { language: "ts", content: "const x = 1;\n\tconsole.log(x);" },
  table: { headers: ["A", "B"], rows: [["1", "2"], ["3", ""]], truncated: true },
  figure: AVAILABLE_FIGURE,
} as const;

/** Builds a list item nested to `depth` (1 = no children). */
function nested(depth: number): ListItem {
  return depth <= 1 ? { text: `d${depth}` } : { text: `d${depth}`, children: [nested(depth - 1)] };
}

describe("ArticleSchema — existing articles", () => {
  it("validates pre-existing article JSON (no kind) unchanged", () => {
    const stored = {
      articleId: VALID_ARTICLE_ID,
      sourceUrl: "https://www.churchofjesuschrist.org/study/general-conference/2024/04/talk",
      title: "Faith",
      importedAt: "2026-04-22T10:00:00.000Z",
      scope: "shared",
      paragraphs: [
        { index: 0, text: "First paragraph." },
        { index: 1, text: "Second paragraph." },
      ],
    };
    expect(ArticleSchema.parse(stored)).toEqual(stored);
  });
});

describe("ArticleParagraphSchema — block kinds", () => {
  it("accepts an explicit text kind without payload", () => {
    expect(ArticleParagraphSchema.safeParse({ index: 0, text: "Hi", kind: "text" }).success).toBe(true);
  });

  for (const [kind, payload] of Object.entries(PAYLOADS)) {
    it(`accepts kind "${kind}" with its payload`, () => {
      const block = { index: 3, text: "flattened", kind, [kind]: payload };
      expect(ArticleParagraphSchema.parse(block)).toEqual(block);
    });

    it(`rejects kind "${kind}" without its payload`, () => {
      expect(ArticleParagraphSchema.safeParse({ index: 0, text: "x", kind }).success).toBe(false);
    });

    it(`rejects a ${kind} payload on a text block`, () => {
      expect(ArticleParagraphSchema.safeParse({ index: 0, text: "x", [kind]: payload }).success).toBe(false);
      expect(
        ArticleParagraphSchema.safeParse({ index: 0, text: "x", kind: "text", [kind]: payload }).success
      ).toBe(false);
    });
  }

  it("rejects a mismatched payload", () => {
    const result = ArticleParagraphSchema.safeParse({ index: 0, text: "x", kind: "heading", code: PAYLOADS.code });
    expect(result.success).toBe(false);
  });

  it("rejects two payloads", () => {
    const result = ArticleParagraphSchema.safeParse({
      index: 0,
      text: "x",
      kind: "heading",
      heading: PAYLOADS.heading,
      table: PAYLOADS.table,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown kind and an out-of-range heading level", () => {
    expect(ArticleParagraphSchema.safeParse({ index: 0, text: "x", kind: "quote" }).success).toBe(false);
    expect(
      ArticleParagraphSchema.safeParse({ index: 0, text: "x", kind: "heading", heading: { level: 1 } }).success
    ).toBe(false);
  });
});

describe("ArticleParagraphSchema — figures", () => {
  const figureBlock = (figure: unknown): unknown => ({ index: 0, text: "Figure", kind: "figure", figure });

  it("accepts an unavailable figure with null asset fields", () => {
    expect(ArticleParagraphSchema.safeParse(figureBlock(UNAVAILABLE_FIGURE)).success).toBe(true);
  });

  for (const field of ["assetKey", "format", "width", "height"] as const) {
    it(`rejects an available figure with null ${field}`, () => {
      const result = ArticleParagraphSchema.safeParse(figureBlock({ ...AVAILABLE_FIGURE, [field]: null }));
      expect(result.success).toBe(false);
    });
  }

  it("treats unavailable: false as available", () => {
    const result = ArticleParagraphSchema.safeParse(
      figureBlock({ ...UNAVAILABLE_FIGURE, unavailable: false })
    );
    expect(result.success).toBe(false);
  });

  it("rejects non-integer or non-positive dimensions", () => {
    for (const bad of [0, -10, 12.5]) {
      expect(ArticleParagraphSchema.safeParse(figureBlock({ ...AVAILABLE_FIGURE, width: bad })).success).toBe(false);
      expect(ArticleParagraphSchema.safeParse(figureBlock({ ...AVAILABLE_FIGURE, height: bad })).success).toBe(false);
    }
  });

  it("rejects an available figure whose assetKey does not match the pattern", () => {
    for (const bad of [`content/assets/${SHA}.exe`, `https://cdn.example.com/${SHA}.png`, "content/assets/abc.png"]) {
      expect(ArticleParagraphSchema.safeParse(figureBlock({ ...AVAILABLE_FIGURE, assetKey: bad })).success).toBe(
        false
      );
    }
  });
});

describe("ArticleParagraphSchema — list depth", () => {
  const listBlock = (items: ListItem[]): unknown => ({
    index: 0,
    text: "- x",
    kind: "list",
    list: { ordered: false, start: 1, items },
  });

  it("accepts a list nested to depth 3", () => {
    expect(ArticleParagraphSchema.safeParse(listBlock([{ text: "flat" }, nested(3)])).success).toBe(true);
  });

  it("rejects a list nested to depth 4", () => {
    expect(ArticleParagraphSchema.safeParse(listBlock([{ text: "flat" }, nested(4)])).success).toBe(false);
  });
});

describe("assetKey() / ASSET_KEY_PATTERN", () => {
  it("builds content/assets/<sha>.<ext> keys that match the pattern", () => {
    expect(FIGURE_KEY).toBe(`content/assets/${SHA}.svg`);
    for (const ext of ["png", "jpg", "gif", "webp", "svg"] as const) {
      expect(ASSET_KEY_PATTERN.test(assetKey(SHA, ext))).toBe(true);
    }
  });

  it("rejects uppercase hex, wrong length, jpeg extension, and path traversal", () => {
    expect(ASSET_KEY_PATTERN.test(assetKey(SHA.toUpperCase(), "png"))).toBe(false);
    expect(ASSET_KEY_PATTERN.test(assetKey(SHA.slice(1), "png"))).toBe(false);
    expect(ASSET_KEY_PATTERN.test(`content/assets/${SHA}.jpeg`)).toBe(false);
    expect(ASSET_KEY_PATTERN.test(`content/assets/../${SHA}.png`)).toBe(false);
  });
});
