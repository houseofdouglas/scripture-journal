import type { ContentType, UserIndexEntry } from "../../types";

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Parses a `YYYY-MM-DD` string into its (year, month, day) components. */
function parseIsoDate(date: string): { y: number; m: number; d: number } {
  const [yStr, mStr, dStr] = date.split("-");
  return { y: Number(yStr), m: Number(mStr), d: Number(dStr) };
}

/**
 * Selects and orders the past-entry rows for the note history rail: entries
 * matching `contentRef`, excluding `today` (those notes render inline
 * instead — spec FR-4), newest date first. Not filtered by `projectId`
 * (spec FR-5) — all of the user's projects are shown.
 */
export function selectNoteHistory(
  entries: UserIndexEntry[],
  contentRef: string,
  today: string
): UserIndexEntry[] {
  return entries
    .filter((e) => e.contentRef === contentRef && e.date !== today)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/**
 * Formats a `YYYY-MM-DD` entry date for a rail row: `MMM d` when it falls in
 * the same calendar year as `today`, `MMM d, yyyy` otherwise.
 */
export function formatEntryDateLabel(date: string, today: string): string {
  const entry = parseIsoDate(date);
  const current = parseIsoDate(today);
  const label = `${MONTH_NAMES[entry.m - 1]} ${entry.d}`;
  return entry.y === current.y ? label : `${label}, ${entry.y}`;
}

/** Formats a `YYYY-MM-DD` date as a full weekday label for the modal header. */
export function formatFullDateLabel(date: string): string {
  const { y, m, d } = parseIsoDate(date);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Truncates `text` to at most `max` characters on a word boundary, appending
 * `…` when truncation occurred. A single token longer than `max` is hard-cut.
 */
export function truncateSnippet(text: string, max = 100): string {
  if (text.length <= max) return text;

  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  const boundary = lastSpace > 0 ? cut.slice(0, lastSpace) : cut;
  return `${boundary}…`;
}

/** Formats a note count for display: `1 note` / `3 notes`. */
export function formatNoteCount(n: number): string {
  return `${n} ${n === 1 ? "note" : "notes"}`;
}

/** Formats a block label: `Verse 12` (scripture, 1-indexed) or `¶ 4` (article, 0-indexed). */
export function blockLabel(contentType: ContentType, blockId: number): string {
  return contentType === "scripture" ? `Verse ${blockId}` : `¶ ${blockId + 1}`;
}
