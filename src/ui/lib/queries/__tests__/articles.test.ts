// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { useArticleIndex } from "../articles";

const VALID_ARTICLE_ID = "a".repeat(64);

const SAMPLE_INDEX = {
  articles: [
    {
      articleId: VALID_ARTICLE_ID,
      title: "Faith in Jesus Christ",
      sourceUrl: "https://churchofjesuschrist.org/study/manual/faith",
      importedAt: "2026-04-22T10:00:00.000Z",
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
