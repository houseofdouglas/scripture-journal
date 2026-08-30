import { useState } from "react";
import { useUserIndex } from "../lib/queries/user-index";
import { useProjects } from "../lib/queries/projects";
import {
  selectNoteHistory,
  formatEntryDateLabel,
  formatNoteCount,
  truncateSnippet,
} from "../lib/note-history";
import type { ContentType } from "../../types";

const VISIBLE_CAP = 8;

interface Props {
  contentRef: string;
  contentType: ContentType;
  onOpenEntry: (entryId: string) => void;
}

function todayLocalDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function NoteHistoryRail({ contentRef, contentType, onOpenEntry }: Props) {
  const { data: index, isLoading, isError, refetch } = useUserIndex();
  const { data: projects = [] } = useProjects();
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const today = todayLocalDate();
  const entries = selectNoteHistory(index?.entries ?? [], contentRef, today);
  const showProjectBadge = projects.length > 1;
  const noun = contentType === "scripture" ? "chapter" : "article";
  const visibleEntries = showAll ? entries : entries.slice(0, VISIBLE_CAP);
  const isEmpty = !isLoading && !isError && entries.length === 0;

  function projectName(projectId: string): string {
    return projects.find((p) => p.projectId === projectId)?.name ?? projectId;
  }

  function renderRows() {
    return (
      <>
        <ul className="space-y-3">
          {visibleEntries.map((entry) => (
            <li key={entry.entryId}>
              <button
                type="button"
                onClick={() => onOpenEntry(entry.entryId)}
                className="w-full rounded border-l-2 border-gray-200 py-1 pl-3 text-left transition-colors hover:border-gray-400 dark:border-gray-700 dark:hover:border-gray-500"
              >
                <div className="flex items-center justify-between gap-2 text-[0.7rem] text-gray-500 dark:text-gray-400">
                  <span>
                    {formatEntryDateLabel(entry.date, today)} · {formatNoteCount(entry.noteCount)}
                  </span>
                  {showProjectBadge && (
                    <span className="shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-[0.65rem] dark:bg-gray-800">
                      {projectName(entry.projectId)}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-300">
                  {truncateSnippet(entry.snippet, 100)}
                </p>
              </button>
            </li>
          ))}
        </ul>
        {entries.length > VISIBLE_CAP && (
          <button
            type="button"
            onClick={() => setShowAll((s) => !s)}
            className="mt-3 text-xs text-gray-500 underline hover:text-gray-600 dark:text-gray-400 dark:hover:text-gray-300"
          >
            {showAll ? "Show fewer" : `Show all ${entries.length} →`}
          </button>
        )}
      </>
    );
  }

  function renderBody() {
    if (isLoading) return <RailSkeleton />;
    if (isError) {
      return (
        <div className="text-xs text-gray-500 dark:text-gray-400">
          <p>Couldn&apos;t load note history.</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-1 underline hover:text-gray-600 dark:hover:text-gray-300"
          >
            Retry
          </button>
        </div>
      );
    }
    if (entries.length === 0) {
      return (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          No past notes on this {noun}.
        </p>
      );
    }
    return renderRows();
  }

  return (
    <>
      {/* Desktop rail — spec FR-6/7/15 */}
      <aside className="hidden lg:sticky lg:top-4 lg:block lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
        <h2 className="mb-3 text-xs font-medium text-gray-500 dark:text-gray-400">
          Past notes
          {!isLoading && !isError && entries.length > 0 ? ` (${entries.length})` : ""}
        </h2>
        {renderBody()}
      </aside>

      {/* Mobile disclosure — spec FR-8; nothing rendered when truly empty (FR-15) */}
      {!isEmpty && (
        <div className="lg:hidden">
          {isLoading || isError ? (
            renderBody()
          ) : (
            <>
              <button
                type="button"
                aria-expanded={mobileExpanded}
                onClick={() => setMobileExpanded((e) => !e)}
                className="mb-3 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400"
              >
                🗒 {entries.length} past {entries.length === 1 ? "note" : "notes"}
              </button>
              {mobileExpanded && renderRows()}
            </>
          )}
        </div>
      )}
    </>
  );
}

function RailSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-10 rounded bg-gray-100 dark:bg-gray-800" />
      ))}
    </div>
  );
}
