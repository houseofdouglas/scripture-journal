// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { JournalEntry } from "../../../types";

vi.mock("../../lib/queries/entry", () => ({
  useJournalEntry: vi.fn(),
}));

import * as entryQueries from "../../lib/queries/entry";
import { PastEntryPage } from "../PastEntryPage";

const mockUseJournalEntry = vi.mocked(entryQueries.useJournalEntry);

const ARTICLE_ID = "b".repeat(64);
const CONTENT_REF = `content/articles/${ARTICLE_ID}.json`;

const ARTICLE_JSON = {
  articleId: ARTICLE_ID,
  sourceUrl: "https://example.com/post",
  title: "Rich Post",
  importedAt: "2026-09-01T10:00:00.000Z",
  scope: "shared",
  paragraphs: [
    { index: 0, text: "Legacy paragraph without kind." },
    { index: 1, kind: "heading", text: "Overview", heading: { level: 2 } },
    { index: 2, kind: "table", text: "Name Value Alpha 1", table: { rows: [] } },
    {
      index: 3,
      kind: "figure",
      text: "The SDLC loop",
      figure: { assetKey: null, format: null, width: null, height: null, alt: "", caption: "The SDLC loop", unavailable: true },
    },
  ],
};

function makeEntry(blockIds: number[]): JournalEntry {
  return {
    entryId: "2026-09-30_0123456789abcdef",
    userId: "00000000-0000-4000-8000-000000000000",
    date: "2026-09-30",
    contentRef: CONTENT_REF,
    contentTitle: "Rich Post",
    contentType: "article",
    projectId: "personal",
    annotations: blockIds.map((blockId) => ({
      blockId,
      text: `Note on block ${blockId}`,
      createdAt: "2026-09-30T12:00:00.000Z",
    })),
    updatedAt: "2026-09-30T12:00:00.000Z",
  };
}

function renderPage(entry: JournalEntry) {
  mockUseJournalEntry.mockReturnValue({
    data: entry,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof entryQueries.useJournalEntry>);

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/entries/${entry.entryId}`]}>
        <Routes>
          <Route path="/entries/:entryId" element={<PastEntryPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(ARTICLE_JSON) })
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("PastEntryPage block excerpts (FR-24)", () => {
  it("prefixes a table block excerpt with 'Table: '", async () => {
    renderPage(makeEntry([2]));
    expect(await screen.findByText("Table: Name Value Alpha 1")).toBeTruthy();
  });

  it("shows a figure block excerpt as 'Figure: <caption>'", async () => {
    renderPage(makeEntry([3]));
    expect(await screen.findByText("Figure: The SDLC loop")).toBeTruthy();
  });

  it("leaves heading and kind-less text excerpts unprefixed", async () => {
    renderPage(makeEntry([0, 1]));
    expect(await screen.findByText("Legacy paragraph without kind.")).toBeTruthy();
    expect(screen.getByText("Overview")).toBeTruthy();
  });
});
