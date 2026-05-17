import { Link, useParams } from "react-router-dom";
import { useChapter, useManifest } from "../lib/queries/scripture";
import { VerseList } from "../components/VerseList";
import { useAnnotationEditor } from "../hooks/useAnnotationEditor";
import { scriptureContentRef } from "../../types";
import type { WorkSlug } from "../../types";

export function ChapterViewPage() {
  const { work: workSlug, book: bookSlug, chapter: chapterStr } = useParams<{
    work: string;
    book: string;
    chapter: string;
  }>();

  const chapterNum = parseInt(chapterStr ?? "0", 10);
  const { data: manifest } = useManifest();
  const { data: chapter, isLoading, isError } = useChapter(workSlug as WorkSlug, bookSlug ?? "", chapterNum);

  const today = new Date();
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const annotation = useAnnotationEditor({
    date,
    contentRef: scriptureContentRef(workSlug as WorkSlug, bookSlug ?? "", chapterNum),
    contentTitle: chapter?.title ?? "",
    contentType: "scripture",
  });

  const work = manifest?.works.find((w) => w.slug === workSlug);
  const book = work?.books.find((b) => b.slug === bookSlug);
  const chapterCount = book?.chapterCount ?? 0;

  if (isLoading) return <ChapterSkeleton />;
  if (isError) {
    return (
      <div>
        <p className="text-red-600 dark:text-red-400">Failed to load chapter.</p>
        <Link to={`/scripture/${workSlug}/${bookSlug}`} className="text-blue-600 hover:underline dark:text-blue-400">← Back</Link>
      </div>
    );
  }
  if (!chapter) {
    return (
      <div>
        <p className="text-gray-600 dark:text-gray-400">Chapter not found.</p>
        <Link to={`/scripture/${workSlug}/${bookSlug}`} className="text-blue-600 hover:underline dark:text-blue-400">← Back</Link>
      </div>
    );
  }

  const hasPrev = chapterNum > 1;
  const hasNext = chapterNum < chapterCount;

  return (
    <div className="mx-auto max-w-2xl">
      {/* Breadcrumb */}
      <nav className="mb-4 flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
        <Link to="/scripture" className="hover:text-gray-900 hover:underline dark:hover:text-gray-100">Scripture</Link>
        <span className="text-gray-300 dark:text-gray-600">›</span>
        <Link to={`/scripture/${workSlug}`} className="hover:text-gray-900 hover:underline dark:hover:text-gray-100">
          {work?.title ?? workSlug}
        </Link>
        {book && book.chapterCount > 1 && (
          <>
            <span className="text-gray-300 dark:text-gray-600">›</span>
            <Link to={`/scripture/${workSlug}/${bookSlug}`} className="hover:text-gray-900 hover:underline dark:hover:text-gray-100">
              {book.title}
            </Link>
          </>
        )}
        <span className="text-gray-300 dark:text-gray-600">›</span>
        <span className="text-gray-700 dark:text-gray-300">{chapter.title}</span>
      </nav>

      <h1 className="mb-6 text-2xl font-semibold text-gray-900 dark:text-gray-100">{chapter.title}</h1>

      <VerseList
        verses={chapter.verses}
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

      {/* Chapter navigation */}
      <div className="mt-10 flex items-center justify-between border-t border-gray-200 pt-6 dark:border-gray-700">
        <div>
          {hasPrev && (
            <Link to={`/scripture/${workSlug}/${bookSlug}/${chapterNum - 1}`} className="text-sm text-blue-600 hover:underline dark:text-blue-400">
              ← Previous Chapter
            </Link>
          )}
        </div>
        <div>
          {hasNext && (
            <Link to={`/scripture/${workSlug}/${bookSlug}/${chapterNum + 1}`} className="text-sm text-blue-600 hover:underline dark:text-blue-400">
              Next Chapter →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function ChapterSkeleton() {
  return (
    <div className="mx-auto max-w-2xl animate-pulse space-y-4">
      <div className="h-4 w-48 rounded bg-gray-200 dark:bg-gray-700" />
      <div className="h-8 w-64 rounded bg-gray-200 dark:bg-gray-700" />
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} className="flex gap-3">
          <div className="h-4 w-5 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-4 flex-1 rounded bg-gray-200 dark:bg-gray-700" />
        </div>
      ))}
    </div>
  );
}
