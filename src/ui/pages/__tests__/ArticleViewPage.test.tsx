// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Article } from "../../../types";

afterEach(cleanup);

vi.mock("../../hooks/useAnnotationEditor", () => ({
  useAnnotationEditor: () => ({
    openBlockId: null,
    editorText: "",
    isSaving: false,
    errorMessage: null,
    savedAnnotations: [],
    openEditor: vi.fn(),
    closeEditor: vi.fn(),
    setEditorText: vi.fn(),
    saveAnnotation: vi.fn(),
    setContentTitle: vi.fn(),
  }),
}));

vi.mock("../../lib/queries/articles", async () => {
  const actual = await vi.importActual<typeof import("../../lib/queries/articles")>(
    "../../lib/queries/articles"
  );
  return {
    ...actual,
    useArticleIndex: vi.fn(),
    useArchiveArticle: vi.fn(),
    useUnarchiveArticle: vi.fn(),
  };
});

import * as articleQueries from "../../lib/queries/articles";
import { ArticleViewPage } from "../ArticleViewPage";

const mockUseArticleIndex = vi.mocked(articleQueries.useArticleIndex);
const mockUseArchiveArticle = vi.mocked(articleQueries.useArchiveArticle);
const mockUseUnarchiveArticle = vi.mocked(articleQueries.useUnarchiveArticle);

const ARTICLE_ID = "a".repeat(64);

const ARTICLE: Article = {
  articleId: ARTICLE_ID,
  sourceUrl: "https://churchofjesuschrist.org/study/manual/faith",
  title: "Faith in Jesus Christ",
  importedAt: "2026-04-22T10:00:00.000Z",
  scope: "shared",
  paragraphs: [{ index: 0, text: "Faith is the first principle of the gospel of Jesus Christ." }],
};

function renderPage(archived: boolean) {
  mockUseArticleIndex.mockReturnValue({
    data: {
      articles: [
        {
          articleId: ARTICLE_ID,
          title: ARTICLE.title,
          sourceUrl: ARTICLE.sourceUrl,
          importedAt: ARTICLE.importedAt,
          archived,
        },
      ],
    },
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof articleQueries.useArticleIndex>);

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["article", ARTICLE_ID], ARTICLE);

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/articles/${ARTICLE_ID}`]}>
        <Routes>
          <Route path="/articles/:articleId" element={<ArticleViewPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("ArticleViewPage — archive/unarchive button", () => {
  let archiveMutate: ReturnType<typeof vi.fn>;
  let unarchiveMutate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    archiveMutate = vi.fn();
    unarchiveMutate = vi.fn();
    mockUseArchiveArticle.mockReturnValue({
      mutate: archiveMutate,
    } as unknown as ReturnType<typeof articleQueries.useArchiveArticle>);
    mockUseUnarchiveArticle.mockReturnValue({
      mutate: unarchiveMutate,
    } as unknown as ReturnType<typeof articleQueries.useUnarchiveArticle>);
  });

  it("shows 'Archive' when the article is not archived", () => {
    renderPage(false);
    expect(screen.getByRole("button", { name: "Archive" })).toBeTruthy();
  });

  it("shows 'Unarchive' when the article is archived", () => {
    renderPage(true);
    expect(screen.getByRole("button", { name: "Unarchive" })).toBeTruthy();
  });

  it("clicking 'Archive' calls archiveMutation.mutate with the articleId", () => {
    renderPage(false);
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));

    expect(archiveMutate).toHaveBeenCalledWith(ARTICLE_ID, expect.objectContaining({ onError: expect.any(Function) }));
  });

  it("clicking 'Unarchive' calls unarchiveMutation.mutate with the articleId", () => {
    renderPage(true);
    fireEvent.click(screen.getByRole("button", { name: "Unarchive" }));

    expect(unarchiveMutate).toHaveBeenCalledWith(ARTICLE_ID, expect.objectContaining({ onError: expect.any(Function) }));
  });

  it("shows an inline error when the archive mutation's onError fires", () => {
    renderPage(false);
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));

    const onError = archiveMutate.mock.calls[0]![1].onError as () => void;
    act(() => onError());

    expect(screen.getByText("Could not archive article. Try again.")).toBeTruthy();
  });
});
