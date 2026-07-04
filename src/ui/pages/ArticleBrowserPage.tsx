import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useArticleIndex, useArchiveArticle, useUnarchiveArticle } from "../lib/queries/articles";
import type { ArticleIndexEntry } from "../../types";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function domain(url: string): string {
  if (url.startsWith("pdf-import:")) return "PDF";
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function filterArticles(articles: ArticleIndexEntry[], query: string): ArticleIndexEntry[] {
  if (!query.trim()) return articles;
  const q = query.toLowerCase();
  return articles.filter(
    (a) => a.title.toLowerCase().includes(q) || a.sourceUrl.toLowerCase().includes(q)
  );
}

export function ArticleBrowserPage() {
  const { data, isLoading, isError, refetch } = useArticleIndex();
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (isLoading) return <LoadingSkeleton />;

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="text-gray-600 dark:text-gray-400">Could not load articles. Check your connection and try again.</p>
        <button
          onClick={() => void refetch()}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
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
        <p className="text-gray-600 dark:text-gray-400">No articles imported yet.</p>
        <Link to="/import" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          Import an article
        </Link>
      </div>
    );
  }

  const visible = articles.filter((a) => a.archived === showArchived);
  const filtered = filterArticles(visible, query);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Browse Articles</h1>
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show archived
        </label>
      </div>

      {actionError && (
        <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {actionError}
        </p>
      )}

      <input
        type="search"
        placeholder="Search by title or URL…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-6 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
        aria-label="Search articles"
      />

      {visible.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">
          {showArchived ? "No archived articles." : "No active articles — all articles are archived."}
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">No articles match your search.</p>
      ) : (
        <ArticleGrid articles={filtered} archived={showArchived} onActionError={setActionError} />
      )}
    </div>
  );
}

function ArticleGrid({
  articles,
  archived,
  onActionError,
}: {
  articles: ArticleIndexEntry[];
  archived: boolean;
  onActionError: (message: string | null) => void;
}) {
  const navigate = useNavigate();
  const archiveMutation = useArchiveArticle();
  const unarchiveMutation = useUnarchiveArticle();

  function handleAction(e: React.MouseEvent, articleId: string) {
    e.stopPropagation();
    onActionError(null);
    const mutation = archived ? unarchiveMutation : archiveMutation;
    mutation.mutate(articleId, {
      onError: () =>
        onActionError(archived ? "Could not unarchive article. Try again." : "Could not archive article. Try again."),
    });
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {articles.map((article) => (
        <div
          key={article.articleId}
          role="button"
          tabIndex={0}
          aria-label={`Open article: ${article.title}`}
          onClick={() => navigate(`/articles/${article.articleId}`)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") navigate(`/articles/${article.articleId}`);
          }}
          className="relative rounded-lg border border-gray-200 bg-white p-5 text-left shadow-sm hover:border-blue-400 hover:shadow dark:border-gray-700 dark:bg-gray-900 dark:hover:border-blue-500"
        >
          <button
            onClick={(e) => handleAction(e, article.articleId)}
            className="absolute right-3 top-3 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-500 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
          >
            {archived ? "Unarchive" : "Archive"}
          </button>
          <h2 className="truncate pr-16 text-base font-medium text-gray-900 dark:text-gray-100">
            {article.title}
          </h2>
          <p className="mt-1 truncate text-sm text-gray-500 dark:text-gray-400">
            {domain(article.sourceUrl)}
          </p>
          <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
            {formatDate(article.importedAt)}
          </p>
        </div>
      ))}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div>
      <div className="mb-6 h-8 w-48 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
      <div className="mb-6 h-9 w-full animate-pulse rounded-md bg-gray-200 dark:bg-gray-700" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <div className="mb-2 h-5 w-3/4 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
            <div className="mb-3 h-4 w-1/2 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
          </div>
        ))}
      </div>
    </div>
  );
}
