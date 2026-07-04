// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import {
  useArticleIndex,
  useArchiveArticle,
  useUnarchiveArticle,
  isArticleArchived,
} from "../articles";

const VALID_ARTICLE_ID = "a".repeat(64);

const SAMPLE_INDEX = {
  articles: [
    {
      articleId: VALID_ARTICLE_ID,
      title: "Faith in Jesus Christ",
      sourceUrl: "https://churchofjesuschrist.org/study/manual/faith",
      importedAt: "2026-04-22T10:00:00.000Z",
      archived: false,
    },
  ],
};

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

// apiClient (used by the mutation hooks below) reads/writes localStorage.
// Node 22's experimental global `localStorage` shadows jsdom's under Vitest
// and isn't a functioning Storage object without `--localstorage-file`, so
// stub it directly rather than relying on the environment's implementation.
function stubLocalStorage() {
  vi.stubGlobal("localStorage", {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  });
}

describe("useArticleIndex()", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns articles on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(SAMPLE_INDEX), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const { result } = renderHook(() => useArticleIndex(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.articles).toHaveLength(1);
    expect(result.current.data?.articles[0]!.title).toBe("Faith in Jesus Christ");
    expect(result.current.isError).toBe(false);
  });

  it("returns { articles: [] } and isError: false on 404", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Not Found", { status: 404 })
    );

    const { result } = renderHook(() => useArticleIndex(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({ articles: [] });
    expect(result.current.isError).toBe(false);
  });

  it("surfaces isError: true on non-404 network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Internal Server Error", { status: 500 })
    );

    const { result } = renderHook(() => useArticleIndex(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.data).toBeUndefined();
  });

  it("surfaces isError: true on malformed JSON response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not json at all", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const { result } = renderHook(() => useArticleIndex(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("isArticleArchived()", () => {
  it("returns false when index is undefined", () => {
    expect(isArticleArchived(undefined, VALID_ARTICLE_ID)).toBe(false);
  });

  it("returns false when no entry matches the articleId", () => {
    expect(isArticleArchived(SAMPLE_INDEX, "b".repeat(64))).toBe(false);
  });

  it("returns the entry's archived value when present", () => {
    const index = { articles: [{ ...SAMPLE_INDEX.articles[0]!, archived: true }] };
    expect(isArticleArchived(index, VALID_ARTICLE_ID)).toBe(true);
  });
});

describe("useArchiveArticle()", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    stubLocalStorage();
  });

  it("posts to /articles/:id/archive and returns the result", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { articleId: VALID_ARTICLE_ID, archived: true } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const { result } = renderHook(() => useArchiveArticle(), { wrapper: makeWrapper() });
    result.current.mutate(VALID_ARTICLE_ID);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({ articleId: VALID_ARTICLE_ID, archived: true });
    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe(`/api/articles/${VALID_ARTICLE_ID}/archive`);
    expect((init as RequestInit).method).toBe("POST");
  });

  it("invalidates the articles index query on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { articleId: VALID_ARTICLE_ID, archived: true } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);

    const { result } = renderHook(() => useArchiveArticle(), { wrapper });
    result.current.mutate(VALID_ARTICLE_ID);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["articles", "index"] });
  });
});

describe("useUnarchiveArticle()", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    stubLocalStorage();
  });

  it("posts to /articles/:id/unarchive and returns the result", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { articleId: VALID_ARTICLE_ID, archived: false } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const { result } = renderHook(() => useUnarchiveArticle(), { wrapper: makeWrapper() });
    result.current.mutate(VALID_ARTICLE_ID);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({ articleId: VALID_ARTICLE_ID, archived: false });
    const [url] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe(`/api/articles/${VALID_ARTICLE_ID}/unarchive`);
  });
});
