import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useArticleIndex } from "../lib/queries/articles";
import type { ArticleIndexEntry } from "../../types";

/** Format an ISO 8601 date string as "Apr 22, 2026". */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Extract the hostname from a URL, e.g. "churchofjesuschrist.org". */
function domain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** Filter articles by a case-insensitive substring match on title or sourceUrl. */
function filterArticles(
  articles: ArticleIndexEntry[],
  query: string
): ArticleIndexEntry[] {
  if (!query.trim()) return articles;
  const q = query.toLowerCase();
  return articles.filter(
    (a) =>
      a.title.toLowerCase().includes(q) ||
      a.sourceUrl.toLowerCase().includes(q)
  );
}

export function ArticleBrowserPage() {
  const { data, isLoading, isError, refetch } = useArticleIndex();
  const [query, setQuery] = useState("");

  if (isLoading) return <LoadingSkeleton />;

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="text-gray-600">
          Could not load articles. Check your connection and try again.
        </p>
        <button
          onClick={() => void refetch()}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          Retry
        </button>
      </div>
    );
  }

  const articles = data?.articles ?? [];

  if (articles.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="text-gray-600">No articles imported yet.</p>
        <Link
          to="/import"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Import an article
        </Link>
      </div>
    );
  }

  const filtered = filterArticles(articles, query);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-gray-900">
        Browse Articles
      </h1>

      {/* Search */}
      <input
        type="search"
        placeholder="Search by title or URL…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-6 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
        aria-label="Search articles"
      />

      {filtered.length === 0 ? (
        <p className="text-gray-500">No articles match your search.</p>
      ) : (
        <ArticleGrid articles={filtered} />
      )}
    </div>
  );
}

function ArticleGrid({ articles }: { articles: ArticleIndexEntry[] }) {
  const navigate = useNavigate();

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {articles.map((article) => (
        <button
          key={article.articleId}
          onClick={() => navigate(`/articles/${article.articleId}`)}
          className="rounded-lg border border-gray-200 bg-white p-5 text-left shadow-sm hover:border-blue-400 hover:shadow"
        >
          <h2 className="truncate text-base font-medium text-gray-900">
            {article.title}
          </h2>
          <p className="mt-1 truncate text-sm text-gray-500">
            {domain(article.sourceUrl)}
          </p>
          <p className="mt-2 text-xs text-gray-400">
            {formatDate(article.importedAt)}
          </p>
        </button>
      ))}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div>
      <div className="mb-6 h-8 w-48 animate-pulse rounded bg-gray-200" />
      <div className="mb-6 h-9 w-full animate-pulse rounded-md bg-gray-200" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
          >
            <div className="mb-2 h-5 w-3/4 animate-pulse rounded bg-gray-200" />
            <div className="mb-3 h-4 w-1/2 animate-pulse rounded bg-gray-200" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-gray-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
