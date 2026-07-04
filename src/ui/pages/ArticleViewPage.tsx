import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ParagraphList } from "../components/ParagraphList";
import { useAnnotationEditor } from "../hooks/useAnnotationEditor";
import { useArticleIndex, useArchiveArticle, useUnarchiveArticle, isArticleArchived } from "../lib/queries/articles";
import type { Article } from "../../types";

async function fetchArticle(articleId: string): Promise<Article | null> {
  const res = await fetch(`/content/articles/${articleId}.json`);
  console.log("[fetchArticle] articleId:", articleId, "status:", res.status);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<Article>;
}

export function ArticleViewPage() {
  const { articleId } = useParams<{ articleId: string }>();
  const [searchParams] = useSearchParams();
  const pastEntryDate = searchParams.get("entry-date");

  const articleRef = `content/articles/${articleId}.json`;
  const today = new Date();
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const annotation = useAnnotationEditor({
    date,
    contentRef: articleRef,
    contentTitle: "Article",
    contentType: "article",
  });

  const { data: article, isLoading, isError } = useQuery<Article | null>({
    queryKey: ["article", articleId],
    queryFn: () => {
      console.log("[useQuery] fetching article:", articleId);
      return fetchArticle(articleId!);
    },
    staleTime: Infinity,
    enabled: Boolean(articleId),
  });

  const { data: articleIndex } = useArticleIndex();
  const archiveMutation = useArchiveArticle();
  const unarchiveMutation = useUnarchiveArticle();
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const isArchived = isArticleArchived(articleIndex, articleId ?? "");

  function handleToggleArchive() {
    setArchiveError(null);
    const mutation = isArchived ? unarchiveMutation : archiveMutation;
    mutation.mutate(articleId!, {
      onError: () =>
        setArchiveError(isArchived ? "Could not unarchive article. Try again." : "Could not archive article. Try again."),
    });
  }

  const isPastEntry = Boolean(pastEntryDate);

  useEffect(() => {
    if (article && !isPastEntry) {
      annotation.setContentTitle(article.title);
    }
  }, [article?.title, isPastEntry]);

  if (isLoading) return <ArticleSkeleton />;
  if (isError) return <div className="text-red-600 dark:text-red-400">Failed to load article.</div>;
  if (!article) {
    return (
      <div>
        <p className="text-gray-600 dark:text-gray-400">Article not found.</p>
        <Link to="/" className="text-blue-600 hover:underline dark:text-blue-400">← Dashboard</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4">
        <Link to="/" className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          ← Dashboard
        </Link>
      </div>

      {isPastEntry && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <strong>Past Entry</strong> — {pastEntryDate}
          <span className="ml-4">
            <Link
              to={`/articles/${articleId}`}
              className="font-medium text-amber-900 underline hover:no-underline dark:text-amber-100"
            >
              Study Today →
            </Link>
          </span>
        </div>
      )}

      {article.previousVersionId && !isPastEntry && (
        <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200">
          This is an updated version of this article.{" "}
          <Link to={`/articles/${article.previousVersionId}`} className="font-medium underline hover:no-underline">
            View previous version
          </Link>
        </div>
      )}

      {/* Article header */}
      <div className="mb-6">
        <div className="mb-1 flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <h1
              className={`text-2xl font-semibold ${isPastEntry ? "text-gray-500 dark:text-gray-400" : "text-gray-900 dark:text-gray-100"}`}
              style={{ fontFamily: "Georgia, serif" }}
            >
              {article.title}
            </h1>
            {article.previousVersionId && (
              <span className="mt-1 shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                Updated
              </span>
            )}
          </div>
          <button
            onClick={handleToggleArchive}
            className="shrink-0 rounded-md border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            {isArchived ? "Unarchive" : "Archive"}
          </button>
        </div>
        {archiveError && (
          <p className="mb-2 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
            {archiveError}
          </p>
        )}
        <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
          {article.sourceUrl.startsWith("pdf-import:") ? (
            <span>PDF</span>
          ) : (
            <a
              href={article.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-600 hover:underline dark:hover:text-gray-300"
            >
              Source ↗
            </a>
          )}
          <span>Imported {new Date(article.importedAt).toLocaleDateString()}</span>
        </div>
      </div>

      <div className={isPastEntry ? "opacity-60" : ""}>
        <ParagraphList
          paragraphs={article.paragraphs ?? []}
          annotation={{
            openBlockId: annotation.openBlockId,
            editorText: annotation.editorText,
            isSaving: annotation.isSaving,
            errorMessage: annotation.errorMessage,
            savedAnnotations: annotation.savedAnnotations,
            onOpen: annotation.openEditor,
            onClose: annotation.closeEditor,
            onTextChange: annotation.setEditorText,
            onSave: annotation.saveAnnotation,
          }}
        />
      </div>
    </div>
  );
}

function ArticleSkeleton() {
  return (
    <div className="mx-auto max-w-2xl animate-pulse space-y-4">
      <div className="h-8 w-72 rounded bg-gray-200 dark:bg-gray-700" />
      <div className="h-3 w-32 rounded bg-gray-200 dark:bg-gray-700" />
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="space-y-2">
          <div className="h-4 w-full rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-4 w-5/6 rounded bg-gray-200 dark:bg-gray-700" />
        </div>
      ))}
    </div>
  );
}
