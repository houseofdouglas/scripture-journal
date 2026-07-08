/**
 * Shared by both the client-side (pdf.js) and server-side (Textract) PDF
 * extractors so their running-header/footer detection can't drift.
 *
 * Drops paragraphs that recur near-verbatim across most pages (mastheads,
 * copyright lines, running titles — common in publisher-distributed
 * reprints). A real content paragraph essentially never repeats across a
 * large fraction of a document's pages.
 */

/** Normalizes a paragraph for repeat detection: strips a trailing page
 * number (the only part of a running header/footer that usually varies
 * page-to-page) and collapses whitespace/case differences. */
function normalizeForRepeatDetection(text: string): string {
  return text
    .replace(/\s*\d+\s*$/, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * Filters out items whose normalized text recurs on at least
 * `max(3, ceil(totalPages * 0.4))` distinct pages.
 */
export function filterRunningHeaders<T extends { pageNum: number; text: string }>(
  items: T[],
  totalPages: number
): T[] {
  const pagesByNormalized = new Map<string, Set<number>>();
  for (const { pageNum, text } of items) {
    const key = normalizeForRepeatDetection(text);
    if (!key) continue;
    let pages = pagesByNormalized.get(key);
    if (!pages) pagesByNormalized.set(key, (pages = new Set()));
    pages.add(pageNum);
  }

  const boilerplateThreshold = Math.max(3, Math.ceil(totalPages * 0.4));
  const boilerplate = new Set(
    Array.from(pagesByNormalized.entries())
      .filter(([, pages]) => pages.size >= boilerplateThreshold)
      .map(([key]) => key)
  );

  return items.filter((item) => !boilerplate.has(normalizeForRepeatDetection(item.text)));
}
