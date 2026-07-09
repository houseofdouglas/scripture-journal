import type { Block } from "@aws-sdk/client-textract";
import { headTmpObject, readTmpObjectPrefix, deleteTmpObject } from "../repository/tmp-upload";
import { analyzeDocumentLayout } from "../repository/textract";
import { ExtractionFailedError } from "../repository/errors";
import { ValidationError } from "./errors";
import { env } from "../config/env";
import { filterRunningHeaders } from "../lib/repeat-filter";
import type { ExtractPdfResponse } from "../types";

const MAX_PDF_BYTES = 50 * 1024 * 1024;
const PDF_MAGIC = Buffer.from("%PDF-");

// Block types kept as content, in the order the spec lists them.
const KEEP_TYPES = new Set(["LAYOUT_TITLE", "LAYOUT_SECTION_HEADER", "LAYOUT_TEXT", "LAYOUT_LIST"]);
// Types that stay standalone even when adjacent text lacks terminal punctuation.
const HEADING_TYPES = new Set(["LAYOUT_TITLE", "LAYOUT_SECTION_HEADER"]);
// Continuation-merge triggers (see mergeContinuations). Merely "lacks
// terminal punctuation" is NOT enough to call a block mid-sentence: sidebar
// captions ("Source: Jan Rivkin, Harvard Business School"), mastheads, and
// figure-text blobs end without punctuation too, and merging one into the
// following body text buries a real paragraph inside a caption. Two stronger
// signals, either sufficient:
//  1. The final whitespace-delimited word starts lowercase ("…the elements
//     of", "…Nor will") — captions end in capitalized proper nouns. The
//     token must also not carry sentence-final punctuation ("of.").
//  2. The block is long (a real column-ending paragraph; captions and labels
//     are short) and merely lacks terminal punctuation — catches legit
//     continuations ending in a capitalized word ("…your strategy: What").
// The costs are asymmetric (a missed merge yields two readable paragraphs; a
// wrong merge mangles text), so short ambiguous blocks never merge.
const MID_SENTENCE_FINAL_WORD = /(?:^|\s)[a-z](?:[^\s]*[a-z,;-])?$/;
const TERMINAL_PUNCTUATION = /[.!?:"”]$/;
const LONG_BLOCK_MIN_CHARS = 150;

// A block whose width exceeds this multiple of the page's median content-block
// width is treated as a callout/sidebar (spanning multiple columns) rather
// than part of the single-column main flow. Such blocks — and any heading
// sitting directly on top of one — are pulled out of the reading flow and
// appended after the page's main text, so a sidebar physically embedded
// between two halves of a continuous body sentence no longer splits it.
const WIDE_BLOCK_FACTOR = 1.4;
// A kept text block that horizontally overlaps a figure/table by more than
// this fraction (of the narrower box) and sits within the figure's vertical
// band is a figure/table label ("Source: …", "Delivery on criteria", axis
// labels) — dropped, not emitted as a paragraph.
const FIGURE_CAPTION_OVERLAP = 0.5;
const FIGURE_BAND_TOP_MARGIN = 0.03;
const FIGURE_BAND_BOTTOM_MARGIN = 0.05;
// Heading-to-aside attachment: a heading directly above a sidebar (small
// vertical gap, horizontally overlapping) belongs with it.
const HEADING_ATTACH_GAP = 0.03;

const FIGURE_TYPES = new Set(["LAYOUT_FIGURE", "LAYOUT_TABLE"]);

interface BBox {
  left: number;
  top: number;
  width: number;
  right: number;
  bottom: number;
}

interface OrderedBlock {
  pageNum: number;
  type: string;
  text: string;
  /** First aside on a page — the merge pass must not fold main text into it. */
  barrier?: boolean;
}

/**
 * Extracts reading-order paragraphs from a previously uploaded PDF (at
 * `key`, in `tmp/extract/`) via Textract Layout analysis. Validates the
 * object's existence, size, and PDF magic bytes before calling Textract;
 * always deletes the tmp object afterward, success or failure.
 *
 * Throws `ValidationError` (→ 422) for a missing/oversized/non-PDF object,
 * and lets `ExtractionFailedError`/`ExtractionTimeoutError` (→ 502) from the
 * repository layer propagate when the Textract job itself fails, times out,
 * or yields no usable text.
 */
export async function extractPdf(key: string): Promise<ExtractPdfResponse> {
  const size = await headTmpObject(key);
  if (size === null) {
    throw new ValidationError({ key: "Uploaded file not found" });
  }
  if (size > MAX_PDF_BYTES) {
    await deleteTmpObject(key);
    throw new ValidationError({ key: "PDF exceeds the 50 MB limit" });
  }

  const prefix = await readTmpObjectPrefix(key, PDF_MAGIC.length);
  if (!prefix.equals(PDF_MAGIC)) {
    await deleteTmpObject(key);
    throw new ValidationError({ key: "File is not a valid PDF" });
  }

  let blocks: Block[];
  let pageCount: number;
  try {
    const result = await analyzeDocumentLayout(env.BUCKET_NAME, key);
    blocks = result.blocks;
    pageCount = result.pageCount;
  } finally {
    await deleteTmpObject(key);
  }

  const ordered = orderBlocksByPage(blocks);
  const suggestedTitle = ordered.find((b) => b.type === "LAYOUT_TITLE")?.text ?? null;

  // Repeat-filter runs before continuation-merge: a running header sitting
  // between two real paragraphs could otherwise get spliced into the text
  // by the merge step before it's recognized as boilerplate.
  const withoutBoilerplate = filterRunningHeaders(ordered, pageCount);
  const merged = mergeContinuations(withoutBoilerplate);

  if (merged.length === 0) {
    throw new ExtractionFailedError("No text found in this PDF");
  }

  return {
    paragraphs: merged.map((b) => b.text),
    suggestedTitle,
    pageCount,
  };
}

/**
 * Walks each PAGE block's CHILD relationship (Textract's documented reading
 * order — top to bottom) rather than the flat `blocks` array, collecting
 * only the top-level LAYOUT_* blocks of interest. Nested blocks (e.g. a
 * LAYOUT_LIST's item blocks) are never PAGE children directly, so they're
 * naturally excluded here and picked up via recursion in `collectLines`.
 *
 * Textract's reading order is trusted for the main column flow, but two
 * geometric corrections are applied per page so a callout box embedded in the
 * middle of the main text doesn't corrupt it:
 *  - figure/table labels (kept blocks overlapping a figure) are dropped;
 *  - sidebar/callout blocks (wider than the main column) are moved to the end
 *    of the page, so removing them lets the two halves of a body sentence
 *    they were sitting between fall adjacent and re-merge.
 * Blocks without geometry (e.g. in synthetic unit tests) fall through to the
 * plain Textract-order path.
 */
function orderBlocksByPage(blocks: Block[]): OrderedBlock[] {
  const byId = new Map(blocks.filter((b) => b.Id).map((b) => [b.Id!, b]));
  const pages = blocks
    .filter((b) => b.BlockType === "PAGE")
    .sort((a, b) => (a.Page ?? 0) - (b.Page ?? 0));

  // The single-column width is a document-level constant (the layout grid),
  // so estimate it once across every content block rather than per page — a
  // per-page median is skewed on diagram-heavy pages full of tiny label
  // blocks, which would misclassify real body columns as wide asides.
  const widths = blocks
    .filter((b) => b.BlockType && KEEP_TYPES.has(b.BlockType))
    .map(boundingBox)
    .filter((b): b is BBox => b !== null)
    .map((b) => b.width)
    .sort((a, b) => a - b);
  const wideThreshold =
    widths.length > 0 ? widths[Math.floor(widths.length / 2)]! * WIDE_BLOCK_FACTOR : Infinity;

  const ordered: OrderedBlock[] = [];
  for (const page of pages) {
    ordered.push(...orderPage(page, byId, wideThreshold));
  }
  return ordered;
}

interface PageItem {
  type: string;
  text: string;
  box: BBox | null;
}

function orderPage(page: Block, byId: Map<string, Block>, wideThreshold: number): OrderedBlock[] {
  const pageNum = page.Page ?? 1;
  const childIds = page.Relationships?.find((r) => r.Type === "CHILD")?.Ids ?? [];
  const children = childIds.map((id) => byId.get(id)).filter((b): b is Block => Boolean(b));

  const figures = children
    .filter((b) => b.BlockType && FIGURE_TYPES.has(b.BlockType))
    .map(boundingBox)
    .filter((b): b is BBox => b !== null);

  let items: PageItem[] = [];
  for (const block of children) {
    if (!block.BlockType || !KEEP_TYPES.has(block.BlockType)) continue;
    const text = joinDehyphenated(collectLines(block, byId));
    if (text) items.push({ type: block.BlockType, text, box: boundingBox(block) });
  }

  // Drop figure/table labels (only decidable when both boxes are known).
  items = items.filter((x) => !(x.box && figures.some((f) => isFigureLabel(x.box!, f))));
  if (items.length === 0) return [];

  // Width alone relocates only body/list blocks — a genuinely full-width
  // banner heading should stay in place, not jump to the page end. Headings
  // move only via the attachment rule below (sitting directly atop a sidebar).
  const asides = new Set(
    items.filter((x) => x.box && x.box.width > wideThreshold && !HEADING_TYPES.has(x.type))
  );
  // A heading directly on top of an aside travels with it.
  for (const heading of items) {
    if (!HEADING_TYPES.has(heading.type) || asides.has(heading) || !heading.box) continue;
    const attached = items.some(
      (a) =>
        asides.has(a) &&
        a.box &&
        horizontalOverlapFraction(heading.box!, a.box) > FIGURE_CAPTION_OVERLAP &&
        a.box.top >= heading.box!.bottom - 0.005 &&
        a.box.top - heading.box!.bottom < HEADING_ATTACH_GAP
    );
    if (attached) asides.add(heading);
  }

  // Main blocks keep Textract's order; asides follow, likewise in order.
  const mainItems = items.filter((x) => !asides.has(x));
  const asideItems = items.filter((x) => asides.has(x));

  const result: OrderedBlock[] = mainItems.map((x) => ({ pageNum, type: x.type, text: x.text }));
  asideItems.forEach((x, i) =>
    result.push({ pageNum, type: x.type, text: x.text, ...(i === 0 ? { barrier: true } : {}) })
  );
  return result;
}

function boundingBox(block: Block): BBox | null {
  const g = block.Geometry?.BoundingBox;
  if (!g || g.Left == null || g.Top == null || g.Width == null || g.Height == null) return null;
  return { left: g.Left, top: g.Top, width: g.Width, right: g.Left + g.Width, bottom: g.Top + g.Height };
}

function horizontalOverlapFraction(a: BBox, b: BBox): number {
  const overlap = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  return overlap / Math.min(a.width, b.width);
}

/** True when `x` is a label of figure `f`: overlaps it horizontally and sits within its vertical band. */
function isFigureLabel(x: BBox, f: BBox): boolean {
  return (
    horizontalOverlapFraction(x, f) > FIGURE_CAPTION_OVERLAP &&
    x.top >= f.top - FIGURE_BAND_TOP_MARGIN &&
    x.top <= f.bottom + FIGURE_BAND_BOTTOM_MARGIN
  );
}

/** Recursively flattens a layout block's LINE descendants, in order. */
function collectLines(block: Block, byId: Map<string, Block>): string[] {
  const out: string[] = [];
  for (const rel of block.Relationships ?? []) {
    if (rel.Type !== "CHILD") continue;
    for (const id of rel.Ids ?? []) {
      const child = byId.get(id);
      if (!child) continue;
      if (child.BlockType === "LINE" && child.Text) {
        out.push(child.Text);
      } else if (child.BlockType?.startsWith("LAYOUT")) {
        out.push(...collectLines(child, byId));
      }
    }
  }
  return out;
}

/** Joins line fragments, merging a trailing "-" with a lowercase continuation. */
function joinDehyphenated(lines: string[]): string {
  return lines
    .reduce((acc, ln) => {
      if (!acc) return ln;
      if (acc.endsWith("-") && /^[a-z]/.test(ln)) return acc.slice(0, -1) + ln;
      return `${acc} ${ln}`;
    }, "")
    .trim();
}

/**
 * Joins a TEXT/LIST block into the previous one when the previous block
 * ends mid-sentence (see the trigger constants above) and this one starts
 * lowercase —
 * repairs a sentence split across a column or page boundary. Headings
 * (TITLE/SECTION_HEADER) are never merged into or out of, per spec FR-5.
 * A previous block ending in a line-break hyphen joins without a space
 * (same dehyphenation rule as within-block line joining).
 */
function mergeContinuations(items: OrderedBlock[]): OrderedBlock[] {
  const merged: OrderedBlock[] = [];
  for (const item of items) {
    const prev = merged[merged.length - 1];
    const prevEndsMidSentence =
      prev &&
      (MID_SENTENCE_FINAL_WORD.test(prev.text) ||
        (prev.text.length >= LONG_BLOCK_MIN_CHARS && !TERMINAL_PUNCTUATION.test(prev.text)));
    const mergeable =
      prev &&
      !item.barrier &&
      !HEADING_TYPES.has(prev.type) &&
      !HEADING_TYPES.has(item.type) &&
      prevEndsMidSentence &&
      /^[a-z]/.test(item.text);
    if (mergeable && prev) {
      prev.text = prev.text.endsWith("-")
        ? prev.text.slice(0, -1) + item.text
        : `${prev.text} ${item.text}`;
    } else {
      merged.push({ ...item });
    }
  }
  return merged;
}
