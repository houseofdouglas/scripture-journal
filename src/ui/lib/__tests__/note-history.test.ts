// Pin a negative-offset timezone before any Date/Intl call in this file —
// proves the component-wise date construction (spec FR-22) never drifts a
// day, unlike `new Date(isoString)`, which parses as UTC midnight.
process.env.TZ = "America/Denver";

import { describe, it, expect } from "vitest";
import {
  selectNoteHistory,
  formatEntryDateLabel,
  formatFullDateLabel,
  truncateSnippet,
  formatNoteCount,
  blockLabel,
} from "../note-history";
import type { UserIndexEntry } from "../../../types";

const CONTENT_REF = "content/scripture/book-of-mormon/alma/32.json";
const TODAY = "2026-08-26";

function entry(overrides: Partial<UserIndexEntry> = {}): UserIndexEntry {
  return {
    entryId: "id",
    date: "2026-08-12",
    contentRef: CONTENT_REF,
    contentTitle: "Alma 32",
    contentType: "scripture",
    projectId: "personal",
    snippet: "A note",
    noteCount: 1,
    ...overrides,
  };
}

describe("selectNoteHistory()", () => {
  it("excludes today's entry for this content", () => {
    const entries = [entry({ entryId: "today", date: TODAY }), entry({ entryId: "past", date: "2026-08-12" })];
    expect(selectNoteHistory(entries, CONTENT_REF, TODAY).map((e) => e.entryId)).toEqual(["past"]);
  });

  it("excludes entries for a different contentRef", () => {
    const entries = [entry({ entryId: "other", contentRef: "content/articles/xyz.json" })];
    expect(selectNoteHistory(entries, CONTENT_REF, TODAY)).toEqual([]);
  });

  it("keeps entries under a different projectId", () => {
    const entries = [entry({ entryId: "work", projectId: "work", date: "2026-08-01" })];
    expect(selectNoteHistory(entries, CONTENT_REF, TODAY).map((e) => e.entryId)).toEqual(["work"]);
  });

  it("returns newest-first", () => {
    const entries = [
      entry({ entryId: "oldest", date: "2026-06-01" }),
      entry({ entryId: "newest", date: "2026-08-10" }),
      entry({ entryId: "middle", date: "2026-07-15" }),
    ];
    expect(selectNoteHistory(entries, CONTENT_REF, TODAY).map((e) => e.entryId)).toEqual([
      "newest",
      "middle",
      "oldest",
    ]);
  });
});

describe("formatEntryDateLabel()", () => {
  it("omits the year for the current calendar year", () => {
    expect(formatEntryDateLabel("2026-08-12", "2026-08-26")).toBe("Aug 12");
  });

  it("includes the year for a previous calendar year", () => {
    expect(formatEntryDateLabel("2025-11-03", "2026-08-26")).toBe("Nov 3, 2025");
  });

  it("never drifts a day under a negative UTC offset timezone", () => {
    expect(formatEntryDateLabel("2026-08-12", "2026-08-26")).not.toBe("Aug 11");
  });
});

describe("formatFullDateLabel()", () => {
  it("renders a full weekday label without drifting a day", () => {
    const label = formatFullDateLabel("2026-08-12");
    expect(label).toContain("August 12, 2026");
    expect(label).not.toContain("August 11, 2026");
  });
});

describe("truncateSnippet()", () => {
  it("leaves short text untouched", () => {
    expect(truncateSnippet("A short note.")).toBe("A short note.");
  });

  it("cuts on a word boundary and appends an ellipsis", () => {
    const text = "The timing here seems tied to the earlier prophecy about the gathering of Israel and its fulfillment";
    const result = truncateSnippet(text, 40);
    expect(result.length).toBeLessThanOrEqual(41);
    expect(result.endsWith("…")).toBe(true);
    expect(text.startsWith(result.slice(0, -1))).toBe(true);
    expect(result.slice(0, -1).endsWith(" ")).toBe(false);
  });

  it("hard-cuts a single token longer than max", () => {
    const text = "a".repeat(150);
    const result = truncateSnippet(text, 100);
    expect(result).toBe(`${"a".repeat(100)}…`);
  });
});

describe("formatNoteCount()", () => {
  it("pluralizes correctly", () => {
    expect(formatNoteCount(1)).toBe("1 note");
    expect(formatNoteCount(3)).toBe("3 notes");
  });
});

describe("blockLabel()", () => {
  it("labels a scripture block by its 1-indexed verse number", () => {
    expect(blockLabel("scripture", 12)).toBe("Verse 12");
  });

  it("labels an article block by its 1-indexed paragraph number", () => {
    expect(blockLabel("article", 3)).toBe("¶ 4");
  });
});
