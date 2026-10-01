// Catch-all text extraction (spec rich-article-blocks FR-14).
//
// After the structured handlers, any text the walker reaches that no handler
// claimed (callout `<div>`s, `<dt>`/`<dd>`, embed boxes, bare text in the
// root) becomes a plain `{ text }` block. One block per *run*: the maximal
// sequence of consecutive inline content under the same nearest block-level
// ancestor.
//
// The walker (`blocks.ts`) calls `uncoveredTextHandler` with the first text
// node of a run (earlier inline content in the same block was consumed by the
// previous call, or ended at a boundary). From there we walk forward in
// document order, concatenating text, until a run boundary:
//   - a block-level element (BLOCK_LEVEL) — it is left for the walker, which
//     handles it (`<p>`, list, …) or descends into it;
//   - embedded content (EMBEDDED) — left for the figure handler, so a figure
//     between two text runs stays between them in the output;
//   - an already-covered node (e.g. something a handler consumed);
//   - leaving the nearest block-level ancestor of the starting text node.
// Excluded elements (icons, buttons, hidden spans…) are skipped WITHOUT
// ending the run. `<br>` is a space inside the run, not a boundary.
//
// Consumed text nodes are marked covered so the walker skips them. Inline
// wrapper elements are NOT marked: a wrapper may still contain a boundary
// (e.g. `<span>text<img></span>`) that the walker must reach.
//
// Only types are imported from `./blocks` (see its header comment).

import type { BlockOutput, ExtractContext, UncoveredTextCallback } from "./blocks";
import { isExcluded, normalizeText } from "./exclusions";

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const CDATA_SECTION_NODE = 4;

/** Elements that start a new block: a run never crosses their boundary. */
export const BLOCK_LEVEL: ReadonlySet<string> = new Set([
  "ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "BODY", "CAPTION", "CENTER", "DD",
  "DETAILS", "DIALOG", "DIR", "DIV", "DL", "DT", "FIELDSET", "FIGCAPTION", "FIGURE",
  "FORM", "H1", "H2", "H3", "H4", "H5", "H6", "HEADER", "HGROUP", "HR", "HTML", "LEGEND",
  "LI", "MAIN", "MENU", "OL", "P", "PRE", "SEARCH", "SECTION", "SUMMARY", "TABLE",
  "TBODY", "TD", "TFOOT", "TH", "THEAD", "TR", "UL",
]);

/** Embedded/replaced content: ends a run (the figure handler may claim it). */
const EMBEDDED: ReadonlySet<string> = new Set([
  "AUDIO", "CANVAS", "EMBED", "IFRAME", "IMG", "MATH", "OBJECT", "PICTURE", "SVG", "VIDEO",
]);

function tag(el: Element): string {
  return el.tagName.toUpperCase();
}

const isBlockLevel = (el: Element): boolean => BLOCK_LEVEL.has(tag(el));
const isBoundary = (el: Element): boolean => isBlockLevel(el) || EMBEDDED.has(tag(el));

/** Nearest block-level ancestor of `node`, or the content root. */
function blockAncestor(node: Node, root: Element): Node {
  for (let current = node.parentNode; current; current = current.parentNode) {
    if (current === root) return root;
    if (current.nodeType === ELEMENT_NODE && isBlockLevel(current as Element)) return current;
  }
  return root;
}

/**
 * Next node after `node` in document order, without descending into `node`,
 * staying inside `container`. Null when `container` is exhausted.
 */
function nextOutside(node: Node, container: Node): Node | null {
  for (let current: Node | null = node; current && current !== container; current = current.parentNode) {
    if (current.nextSibling) return current.nextSibling;
  }
  return null;
}

/** Collect the run starting at `start`; marks consumed text nodes covered. */
function collectRun(start: Text, ctx: ExtractContext): string {
  const container = blockAncestor(start, ctx.root);
  const parts: string[] = [start.data];
  ctx.markCovered(start);

  let node = nextOutside(start, container);
  while (node) {
    if (ctx.isCovered(node)) break;

    if (node.nodeType === TEXT_NODE || node.nodeType === CDATA_SECTION_NODE) {
      parts.push((node as CharacterData).data);
      ctx.markCovered(node);
      node = nextOutside(node, container);
      continue;
    }

    if (node.nodeType !== ELEMENT_NODE) {
      node = nextOutside(node, container); // comments, processing instructions
      continue;
    }

    const el = node as Element;
    if (isExcluded(el)) {
      node = nextOutside(el, container); // skipped; the run continues
      continue;
    }
    if (tag(el) === "BR") {
      parts.push(" ");
      node = nextOutside(el, container);
      continue;
    }
    if (isBoundary(el)) break;

    // Inline wrapper: descend.
    node = el.firstChild ?? nextOutside(el, container);
  }

  return normalizeText(parts.join(""));
}

/** FR-14: one `{ text }` block per maximal run of uncovered inline content. */
export const uncoveredTextHandler: UncoveredTextCallback = (text, ctx): BlockOutput[] => {
  const run = collectRun(text, ctx);
  return run ? [{ text: run }] : [];
};
