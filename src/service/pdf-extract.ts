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
const TERMINAL_PUNCTUATION = /[.!?:"”]$/;

interface OrderedBlock {
  pageNum: number;
  type: string;
  text: string;
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
 */
function orderBlocksByPage(blocks: Block[]): OrderedBlock[] {
  const byId = new Map(blocks.filter((b) => b.Id).map((b) => [b.Id!, b]));
  const pages = blocks
    .filter((b) => b.BlockType === "PAGE")
    .sort((a, b) => (a.Page ?? 0) - (b.Page ?? 0));

  const ordered: OrderedBlock[] = [];
  for (const page of pages) {
    const childIds = page.Relationships?.find((r) => r.Type === "CHILD")?.Ids ?? [];
    for (const id of childIds) {
      const block = byId.get(id);
      if (!block?.BlockType || !KEEP_TYPES.has(block.BlockType)) continue;
      const lines = collectLines(block, byId);
      const text = joinDehyphenated(lines);
      if (text) ordered.push({ pageNum: page.Page ?? 1, type: block.BlockType, text });
    }
  }
  return ordered;
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
 * doesn't end in terminal punctuation and this one starts lowercase —
 * repairs a sentence split across a column or page boundary. Headings
 * (TITLE/SECTION_HEADER) are never merged into or out of, per spec FR-5.
 */
function mergeContinuations(items: OrderedBlock[]): OrderedBlock[] {
  const merged: OrderedBlock[] = [];
  for (const item of items) {
    const prev = merged[merged.length - 1];
    const mergeable =
      prev &&
      !HEADING_TYPES.has(prev.type) &&
      !HEADING_TYPES.has(item.type) &&
      !TERMINAL_PUNCTUATION.test(prev.text) &&
      /^[a-z]/.test(item.text);
    if (mergeable && prev) {
      prev.text = `${prev.text} ${item.text}`;
    } else {
      merged.push({ ...item });
    }
  }
  return merged;
}
