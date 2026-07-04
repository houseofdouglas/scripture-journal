// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

afterEach(cleanup);

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

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
import { ArticleBrowserPage } from "../ArticleBrowserPage";

const mockUseArticleIndex = vi.mocked(articleQueries.useArticleIndex);
const mockUseArchiveArticle = vi.mocked(articleQueries.useArchiveArticle);
const mockUseUnarchiveArticle = vi.mocked(articleQueries.useUnarchiveArticle);

const ARTICLE_A = "a".repeat(64);
const ARTICLE_B = "b".repeat(64);
const ARTICLE_C = "c".repeat(64);

const ARTICLES = [
  { articleId: ARTICLE_A, title: "Faith in Jesus Christ", sourceUrl: "https://x.org/faith", importedAt: "2026-04-22T10:00:00.000Z", archived: false },
  { articleId: ARTICLE_B, title: "The Living Christ", sourceUrl: "https://x.org/living-christ", importedAt: "2026-05-01T10:00:00.000Z", archived: false },
  { articleId: ARTICLE_C, title: "An Old Conference Talk", sourceUrl: "https://x.org/old-talk", importedAt: "2026-01-01T10:00:00.000Z", archived: true },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <ArticleBrowserPage />
    </MemoryRouter>
  );
}

describe("ArticleBrowserPage — archive/unarchive", () => {
  let archiveMutate: ReturnType<typeof vi.fn>;
  let unarchiveMutate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    archiveMutate = vi.fn();
    unarchiveMutate = vi.fn();
    mockUseArticleIndex.mockReturnValue({
      data: { articles: ARTICLES },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof articleQueries.useArticleIndex>);
    mockUseArchiveArticle.mockReturnValue({
      mutate: archiveMutate,
    } as unknown as ReturnType<typeof articleQueries.useArchiveArticle>);
    mockUseUnarchiveArticle.mockReturnValue({
      mutate: unarchiveMutate,
    } as unknown as ReturnType<typeof articleQueries.useUnarchiveArticle>);
  });

  it("shows only non-archived articles by default", () => {
    renderPage();
    expect(screen.getByText("Faith in Jesus Christ")).toBeTruthy();
    expect(screen.getByText("The Living Christ")).toBeTruthy();
    expect(screen.queryByText("An Old Conference Talk")).toBeNull();
  });

  it("shows only archived articles when 'Show archived' is toggled on", () => {
    renderPage();
    fireEvent.click(screen.getByLabelText("Show archived"));

    expect(screen.getByText("An Old Conference Talk")).toBeTruthy();
    expect(screen.queryByText("Faith in Jesus Christ")).toBeNull();
    expect(screen.queryByText("The Living Christ")).toBeNull();
  });

  it("shows 'No archived articles.' when the toggle is on and none are archived", () => {
    mockUseArticleIndex.mockReturnValue({
      data: { articles: ARTICLES.map((a) => ({ ...a, archived: false })) },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof articleQueries.useArticleIndex>);
    renderPage();
    fireEvent.click(screen.getByLabelText("Show archived"));

    expect(screen.getByText("No archived articles.")).toBeTruthy();
  });

  it("clicking a card's Archive action calls archiveMutation.mutate and does not navigate", () => {
    renderPage();
    const archiveButtons = screen.getAllByRole("button", { name: "Archive" });
    fireEvent.click(archiveButtons[0]!);

    expect(archiveMutate).toHaveBeenCalledWith(ARTICLE_A, expect.objectContaining({ onError: expect.any(Function) }));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("clicking a card body navigates to the article", () => {
    renderPage();
    fireEvent.click(screen.getByText("Faith in Jesus Christ"));

    expect(mockNavigate).toHaveBeenCalledWith(`/articles/${ARTICLE_A}`);
  });

  it("clicking Unarchive in the archived view calls unarchiveMutation.mutate", () => {
    renderPage();
    fireEvent.click(screen.getByLabelText("Show archived"));
    fireEvent.click(screen.getByRole("button", { name: "Unarchive" }));

    expect(unarchiveMutate).toHaveBeenCalledWith(ARTICLE_C, expect.objectContaining({ onError: expect.any(Function) }));
  });

  it("shows an inline error when the archive mutation's onError fires", () => {
    renderPage();
    const archiveButtons = screen.getAllByRole("button", { name: "Archive" });
    fireEvent.click(archiveButtons[0]!);

    const onError = archiveMutate.mock.calls[0]![1].onError as () => void;
    act(() => onError());

    expect(screen.getByText("Could not archive article. Try again.")).toBeTruthy();
  });

  it("shows an inline error when the unarchive mutation's onError fires", () => {
    renderPage();
    fireEvent.click(screen.getByLabelText("Show archived"));
    fireEvent.click(screen.getByRole("button", { name: "Unarchive" }));

    const onError = unarchiveMutate.mock.calls[0]![1].onError as () => void;
    act(() => onError());

    expect(screen.getByText("Could not unarchive article. Try again.")).toBeTruthy();
  });

  it("search while 'Show archived' is off only matches non-archived cards", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("Search articles"), { target: { value: "Living" } });

    expect(screen.getByText("The Living Christ")).toBeTruthy();
    expect(screen.queryByText("Faith in Jesus Christ")).toBeNull();
    expect(screen.queryByText("An Old Conference Talk")).toBeNull();
  });

  it("search while 'Show archived' is on only matches archived cards", () => {
    renderPage();
    fireEvent.click(screen.getByLabelText("Show archived"));
    fireEvent.change(screen.getByLabelText("Search articles"), { target: { value: "Old" } });

    expect(screen.getByText("An Old Conference Talk")).toBeTruthy();

    // A query that only matches a non-archived title finds nothing in the archived view
    fireEvent.change(screen.getByLabelText("Search articles"), { target: { value: "Living" } });
    expect(screen.queryByText("The Living Christ")).toBeNull();
    expect(screen.getByText("No articles match your search.")).toBeTruthy();
  });
});
