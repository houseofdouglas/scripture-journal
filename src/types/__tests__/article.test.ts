import { describe, it, expect } from "vitest";
import {
  ArticleIndexEntrySchema,
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
