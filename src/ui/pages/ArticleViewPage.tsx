import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ParagraphList } from "../components/ParagraphList";
import type { Article } from "../../types";

async function fetchArticle(articleId: string): Promise<Article | null> {
  const res = await fetch(`/content/articles/${articleId}.json`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<Article>;
}

export function ArticleViewPage() {
  const { articleId } = useParams<{ articleId: string }>();
  const [searchParams] = useSearchParams();
  const pastEntryDate = searchParams.get("entry-date"); // set when viewing a past entry

  const { data: article, isLoading, isError } = useQuery({
    queryKey: ["article", articleId],
    queryFn: () => fetchArticle(articleId!),
    staleTime: Infinity, // articles are immutable
    enabled: Boolean(articleId),
  });

  if (isLoading) return <ArticleSkeleton />;
  if (isError) return <div className="text-red-600">Failed to load article.</div>;
  if (!article) {
    return (
      <div>
        <p className="text-gray-600">Article not found.</p>
        <Link to="/" className="text-blue-600 hover:underline">← Dashboard</Link>
      </div>
    );
  }

  const isPastEntry = Boolean(pastEntryDate);

  return (
    <div className="mx-auto max-w-2xl">
      {/* Past entry banner */}
      {isPastEntry && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>Past Entry</strong> — {pastEntryDate}
          <span className="ml-4">
            <Link
              to={`/articles/${articleId}`}
              className="font-medium text-amber-900 underline hover:no-underline"
            >
              Study Today →
            </Link>
          </span>
        </div>
      )}

      {/* New version notice */}
      {article.previousVersionId && !isPastEntry && (
        <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          This is an updated version of this article.{" "}
          <Link
            to={`/articles/${article.previousVersionId}`}
            className="font-medium underline hover:no-underline"
          >
            View previous version
          </Link>
        </div>
      )}

      {/* Article header */}
      <div className="mb-6">
        <div className="mb-1 flex items-start gap-2">
          <h1
            className={`text-2xl font-semibold ${isPastEntry ? "text-gray-500" : "text-gray-900"}`}
            style={{ fontFamily: "Georgia, serif" }}
          >
            {article.title}
          </h1>
          {article.previousVersionId && (
            <span className="mt-1 shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
              Updated
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <a
            href={article.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gray-600 hover:underline"
          >
            Source ↗
          </a>
          <span>Imported {new Date(article.importedAt).toLocaleDateString()}</span>
        </div>
      </div>

      {/* Content */}
      <div className={isPastEntry ? "opacity-60" : ""}>
        <ParagraphList paragraphs={article.paragraphs} />
      </div>
    </div>
  );
}

function ArticleSkeleton() {
  return (
    <div className="mx-auto max-w-2xl animate-pulse space-y-4">
      <div className="h-8 w-72 rounded bg-gray-200" />
      <div className="h-3 w-32 rounded bg-gray-200" />
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="space-y-2">
          <div className="h-4 w-full rounded bg-gray-200" />
          <div className="h-4 w-5/6 rounded bg-gray-200" />
        </div>
      ))}
    </div>
  );
}
