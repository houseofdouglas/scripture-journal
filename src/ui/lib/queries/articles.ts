import { useQuery } from "@tanstack/react-query";
import { ArticleIndexSchema } from "../../../types";
import type { ArticleIndex } from "../../../types";

const ARTICLE_INDEX_URL = "/content/articles/index.json";

/**
 * Fetch the article browse index from CloudFront-cached S3.
 * Returns an empty index when no articles have been imported yet (404).
 * Throws on any other non-2xx response or parse failure.
 */
async function fetchArticleIndex(): Promise<ArticleIndex> {
  const res = await fetch(ARTICLE_INDEX_URL);

  if (res.status === 404) {
    return { articles: [] };
  }

  if (!res.ok) {
    throw new Error(`Failed to load article index: HTTP ${res.status}`);
  }

  let raw: unknown;
  try {
    raw = await res.json();
  } catch {
    throw new Error("Failed to load article index: response was not valid JSON");
  }

  return ArticleIndexSchema.parse(raw);
}

/**
 * TanStack Query hook for the article browse index.
 *
 * - staleTime: 0 — always re-fetch on mount; the CloudFront invalidation
 *   issued after each import guarantees freshness, so there is no benefit
 *   to a client-side cache window.
 * - 404 resolves to `{ articles: [] }` (empty index, not an error).
 * - Any other fetch or parse failure surfaces as `isError: true`.
 */
export function useArticleIndex() {
  return useQuery<ArticleIndex>({
    queryKey: ["articles", "index"],
    queryFn: fetchArticleIndex,
    staleTime: 0,
  });
}
