import { Link } from "react-router-dom";
import type { UserIndexEntry } from "../../types";

interface Props {
  entry: UserIndexEntry;
  date: string; // YYYY-MM-DD, formatted for display
}

export function EntryCard({ entry, date }: Props) {
  return (
    <Link
      to={`/entries/${entry.entryId}`}
      className="block rounded-lg border border-gray-200 bg-white p-4 shadow-sm hover:border-blue-300 hover:shadow"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-500">
          {formatDate(date)}
        </span>
        <TypeBadge type={entry.contentType} />
      </div>
      <h3 className="mb-1 font-semibold text-gray-900">{entry.contentTitle}</h3>
      {entry.snippet && (
        <p className="mb-2 line-clamp-2 text-sm text-gray-600">{entry.snippet}</p>
      )}
      <p className="text-xs text-gray-400">
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
          ? "bg-indigo-100 text-indigo-700"
          : "bg-amber-100 text-amber-700"
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
