import { describe, it, expect } from "vitest";
import { ArticleIndexEntrySchema } from "../article";

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
