import { Link } from "react-router-dom";
import { TypeBadge } from "./EntryCard";
import type { UserIndexEntry } from "../../types";

interface Props {
  date: string; // YYYY-MM-DD
  entries: UserIndexEntry[];
}

/** Grouped multi-entry day — shows header + compact rows without snippet. */
export function EntryDayGroup({ date, entries }: Props) {
  const [yearStr, monthStr, dayStr] = date.split("-");
  const year = +yearStr!;
  const month = +monthStr!;
  const day = +dayStr!;
  const label = new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <div className="border-b border-gray-100 px-4 py-2 dark:border-gray-800">
        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</span>
      </div>
      <ul className="divide-y divide-gray-100 dark:divide-gray-800">
        {entries.map((entry) => (
          <li key={entry.entryId}>
            <Link
              to={`/entries/${entry.entryId}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <div className="flex items-center gap-3">
                <TypeBadge type={entry.contentType} />
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                  {entry.contentTitle}
                </span>
              </div>
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {entry.noteCount} {entry.noteCount === 1 ? "note" : "notes"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
