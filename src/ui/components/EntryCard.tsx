import { Link } from "react-router-dom";
import type { UserIndexEntry } from "../../types";
import type { Project } from "../../types";

interface Props {
  entry: UserIndexEntry;
  date: string; // YYYY-MM-DD, formatted for display
  showProject?: Project[] | undefined;
}

export function EntryCard({ entry, date, showProject }: Props) {
  const projectName = showProject?.find(
    (p) => p.projectId === (entry.projectId ?? "personal")
  )?.name;

  return (
    <Link
      to={`/entries/${entry.entryId}`}
      className="block rounded-lg border border-gray-200 bg-white p-4 shadow-sm hover:border-blue-300 hover:shadow dark:border-gray-700 dark:bg-gray-900 dark:hover:border-blue-600"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
          {formatDate(date)}
        </span>
        <div className="flex items-center gap-2">
          {projectName && (
            <span className="rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
              {projectName}
            </span>
          )}
          <TypeBadge type={entry.contentType} />
        </div>
      </div>
      <h3 className="mb-1 font-semibold text-gray-900 dark:text-gray-100">{entry.contentTitle}</h3>
      {entry.snippet && (
        <p className="mb-2 line-clamp-2 text-sm text-gray-600 dark:text-gray-400">{entry.snippet}</p>
      )}
      <p className="text-xs text-gray-400 dark:text-gray-500">
        {entry.noteCount} {entry.noteCount === 1 ? "note" : "notes"}
      </p>
    </Link>
  );
}

export function TypeBadge({ type }: { type: "scripture" | "article" }) {
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${
        type === "scripture"
          ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300"
          : "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
      }`}
    >
      {type}
    </span>
  );
}

function formatDate(dateStr: string): string {
  const [yearStr, monthStr, dayStr] = dateStr.split("-");
  const year = +yearStr!;
  const month = +monthStr!;
  const day = +dayStr!;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}
