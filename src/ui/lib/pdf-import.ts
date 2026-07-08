import * as pdfjsLib from "pdfjs-dist";
import { filterRunningHeaders } from "../../lib/repeat-filter";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

// pdfjs-dist's getTextContent() consumes a ReadableStream via `for await...of`,
// which needs ReadableStream.prototype[Symbol.asyncIterator]. Some Safari
// builds still lack it, throwing "undefined is not a function" deep inside
// the library. Polyfill it up front rather than depend on the OS/browser.
if (typeof ReadableStream !== "undefined" && !(ReadableStream.prototype as any)[Symbol.asyncIterator]) {
  (ReadableStream.prototype as any)[Symbol.asyncIterator] = async function* (this: ReadableStream) {
    const reader = this.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  };
}

interface PositionedItem {
  str: string;
  x: number; // left edge
  y: number; // baseline (PDF y increases upward)
  w: number;
  h: number;
}

// Minimum horizontal gap (pt) in a block's x-projection to treat as a column
// gutter. Body-column gutters are typically 12–20pt; word spaces are < 8pt.
const X_GUTTER_MIN = 8;
// Minimum vertical gap (pt) in a block's y-projection to treat as a band
// break (e.g. between a two-column text area and a full-width figure).
const Y_BAND_MIN = 14;
// Items whose baselines differ by no more than this are the same line.
const LINE_Y_TOL = 2;
// Gap (pt) between adjacent items on a line beyond which a space is inserted.
const WORD_GAP = 1;
// A line starting at least this far right of the block's left edge (when the
// previous line doesn't) marks a first-line paragraph indent.
const INDENT_MIN = 4;

/**
 * Find gaps in a block's 1-D projection onto the given axis. Returns the
 * midpoints of gaps at least `minGap` wide — the cut positions.
 */
function projectionGaps(items: PositionedItem[], axis: "x" | "y", minGap: number): number[] {
  const spans = items
    .map((it): [number, number] => (axis === "x" ? [it.x, it.x + it.w] : [it.y, it.y + it.h]))
    .sort((a, b) => a[0] - b[0]);
  const cuts: number[] = [];
  let coveredTo = -Infinity;
  for (const [a, b] of spans) {
    if (coveredTo !== -Infinity && a - coveredTo >= minGap) cuts.push((coveredTo + a) / 2);
    coveredTo = Math.max(coveredTo, b);
  }
  return cuts;
}

/**
 * Recursive XY-cut page segmentation. Alternately splits a block of text
 * items on horizontal whitespace bands (y-projection gaps), then on vertical
 * column gutters (x-projection gaps), recursing until no split is possible.
 * Returns leaf blocks in reading order: top-to-bottom, columns left-to-right.
 *
 * Splitting on y first is what makes multi-column layouts with full-width
 * elements work: a page with two text columns above a full-width figure has
 * no page-wide gutter (the figure covers it), but the y-cut first separates
 * the column band from the figure band, and the gutter is then visible
 * within the column band alone.
 */
function xyCut(items: PositionedItem[], depth = 0): PositionedItem[][] {
  if (items.length === 0) return [];
  if (depth > 8) return [items];

  const yCuts = projectionGaps(items, "y", Y_BAND_MIN);
  if (yCuts.length > 0) {
    const bands: PositionedItem[][] = Array.from({ length: yCuts.length + 1 }, () => []);
    for (const it of items) {
      const mid = it.y + it.h / 2;
      let idx = yCuts.findIndex((c) => mid < c);
      if (idx === -1) idx = yCuts.length;
      bands[idx]!.push(it);
    }
    // bands[0] holds the lowest y values (bottom of page); reverse for top-first
    return bands.reverse().flatMap((band) => xyCut(band, depth + 1));
  }

  const xCuts = projectionGaps(items, "x", X_GUTTER_MIN);
  if (xCuts.length > 0) {
    const cols: PositionedItem[][] = Array.from({ length: xCuts.length + 1 }, () => []);
    for (const it of items) {
      const mid = it.x + it.w / 2;
      let idx = xCuts.findIndex((c) => mid < c);
      if (idx === -1) idx = xCuts.length;
      cols[idx]!.push(it);
    }
    return cols.flatMap((col) => xyCut(col, depth + 1));
  }

  return [items];
}

/**
 * Convert one leaf block into paragraphs: group items into lines by baseline,
 * join items with spaces where their x-gap indicates a word break, then split
 * paragraphs on either a vertical gap (> 1.5 × median line gap) or a
 * first-line indent. Lines within a paragraph are joined with dehyphenation
 * (a trailing "-" followed by a lowercase continuation merges the word).
 */
function blockToParagraphs(items: PositionedItem[]): string[] {
  items.sort((a, b) => b.y - a.y || a.x - b.x);

  const lines: { y: number; x: number; text: string; items: PositionedItem[] }[] = [];
  for (const it of items) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - it.y) <= LINE_Y_TOL) {
      last.items.push(it);
    } else {
      lines.push({ y: it.y, x: 0, text: "", items: [it] });
    }
  }

  for (const line of lines) {
    line.items.sort((a, b) => a.x - b.x);
    let text = "";
    let prevEnd: number | null = null;
    for (const it of line.items) {
      if (prevEnd !== null && it.x - prevEnd > WORD_GAP && !text.endsWith(" ") && !it.str.startsWith(" ")) {
        text += " ";
      }
      text += it.str;
      prevEnd = it.x + it.w;
    }
    line.text = text.trim();
    line.x = line.items[0]!.x;
  }

  const nonEmpty = lines.filter((l) => l.text);
  if (nonEmpty.length === 0) return [];

  // Normal line-to-line spacing from the median gap between consecutive lines;
  // a gap well beyond it separates paragraphs.
  const gaps = nonEmpty
    .slice(1)
    .map((l, i) => nonEmpty[i]!.y - l.y)
    .filter((g) => g > 0)
    .sort((a, b) => a - b);
  const medianGap = gaps[Math.floor(gaps.length / 2)] ?? 12;
  const paraGap = medianGap * 1.5;

  // Dominant left edge (lower quartile is robust against a few indented lines).
  const xs = nonEmpty.map((l) => l.x).sort((a, b) => a - b);
  const leftEdge = xs[Math.floor(xs.length * 0.25)]!;

  const paras: string[][] = [[]];
  for (let i = 0; i < nonEmpty.length; i++) {
    const line = nonEmpty[i]!;
    if (i > 0) {
      const vGap = nonEmpty[i - 1]!.y - line.y;
      const indented = line.x - leftEdge >= INDENT_MIN && nonEmpty[i - 1]!.x - leftEdge < INDENT_MIN;
      if (vGap > paraGap || indented) paras.push([]);
    }
    paras[paras.length - 1]!.push(line.text);
  }

  return paras
    .map((p) =>
      p
        .reduce((acc, ln) => {
          if (acc.endsWith("-") && /^[a-z]/.test(ln)) return acc.slice(0, -1) + ln;
          return acc ? acc + " " + ln : ln;
        }, "")
        .trim()
    )
    .filter(Boolean);
}

export async function extractPdfText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const allParagraphs: { pageNum: number; text: string }[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const { items } = await page.getTextContent();

    const positioned: PositionedItem[] = [];
    for (const raw of items) {
      if (!("str" in raw) || !raw.str || !raw.str.trim()) continue;
      const t = raw as unknown as { str: string; width?: number; height: number; transform: number[] };
      positioned.push({
        str: t.str,
        x: t.transform[4]!,
        y: t.transform[5]!,
        w: t.width ?? 0,
        h: t.height || 10,
      });
    }

    for (const block of xyCut(positioned)) {
      for (const text of blockToParagraphs(block)) {
        allParagraphs.push({ pageNum, text });
      }
    }
  }

  return filterRunningHeaders(allParagraphs, pdf.numPages)
    .map(({ text }) => text)
    .join("\n\n");
}
