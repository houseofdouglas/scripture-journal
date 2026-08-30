import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useJournalEntry } from "../lib/queries/entry";
import { useProjects } from "../lib/queries/projects";
import { formatFullDateLabel, formatNoteCount, blockLabel } from "../lib/note-history";
import { scrollToBlock } from "../lib/block-scroll";
import type { ContentType } from "../../types";

interface Props {
  entryId: string;
  contentType: ContentType;
  onClose: () => void;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function NoteHistoryModal({ entryId, contentType, onClose }: Props) {
  const { data: entry, isLoading, isError } = useJournalEntry(entryId);
  const { data: projects = [] } = useProjects();
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingId = `note-history-heading-${entryId}`;

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (!dialog.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.body.style.overflow = originalOverflow;
      previouslyFocused?.focus();
    };
  }, [onClose]);

  function handleBlockClick(blockId: number) {
    onClose();
    scrollToBlock(contentType, blockId);
  }

  function projectName(projectId: string): string {
    return projects.find((p) => p.projectId === projectId)?.name ?? projectId;
  }

  const heading = entry ? formatFullDateLabel(entry.date) : isError ? "Entry unavailable" : "Loading entry";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-5 shadow-xl dark:bg-gray-900"
      >
        <h2 id={headingId} className={entry ? "text-sm font-semibold text-gray-700 dark:text-gray-200" : "sr-only"}>
          {heading}
        </h2>

        {isLoading && <ModalSkeleton />}

        {!isLoading && (isError || !entry) && (
          <div className="mt-3 space-y-3 text-sm text-gray-500 dark:text-gray-400">
            <p>Couldn&apos;t load this entry.</p>
            <Link
              to={`/entries/${entryId}`}
              onClick={onClose}
              className="text-blue-600 underline hover:no-underline dark:text-blue-400"
            >
              Open full entry →
            </Link>
          </div>
        )}

        {!isLoading && entry && (
          <>
            <p className="mt-0.5 mb-4 text-xs text-gray-500 dark:text-gray-400">
              {formatNoteCount(entry.annotations.length)}
              {projects.length > 1 ? ` · ${projectName(entry.projectId)}` : ""}
            </p>

            <div className="space-y-4">
              {entry.annotations.map((annotation, i) => (
                <div key={i}>
                  <button
                    type="button"
                    onClick={() => handleBlockClick(annotation.blockId)}
                    className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {blockLabel(contentType, annotation.blockId)}
                  </button>
                  <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                    {new Date(annotation.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  </span>
                  <p className="mt-1 text-sm text-gray-800 dark:text-gray-200">{annotation.text}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 border-t border-gray-100 pt-3 dark:border-gray-800">
              <Link
                to={`/entries/${entryId}`}
                onClick={onClose}
                className="text-xs text-blue-600 underline hover:no-underline dark:text-blue-400"
              >
                Open full entry →
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ModalSkeleton() {
  return (
    <div className="mt-3 animate-pulse space-y-3">
      <div className="h-3 w-24 rounded bg-gray-200 dark:bg-gray-700" />
      <div className="h-16 rounded bg-gray-100 dark:bg-gray-800" />
    </div>
  );
}
