// List extraction (spec rich-article-blocks FR-5).
//
// One block per outermost `<ul>`/`<ol>` (the walker never descends into a
// handled element, so only outermost lists reach this handler). Item text is
// the `<li>`'s plain text minus nested lists and excluded elements; block-level
// children (`<p>`, `<div>`, `<pre>`, `<table>`, `<figure>`, …) are joined with
// a single space and whitespace-collapsed. Nesting is kept to MAX_LIST_DEPTH;
// deeper items are appended, in order, as siblings at the deepest level.

import { MAX_LIST_DEPTH, type ListItem } from "../../types/article";
import type { BlockHandler, BlockOutput } from "./blocks";
import { isExcluded, normalizeText } from "./exclusions";

/** Maximum items per list, counted across all depths (FR-5). */
export const MAX_LIST_ITEMS = 200;

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const CDATA_SECTION_NODE = 4;

const LIST_TAGS: ReadonlySet<string> = new Set(["UL", "OL"]);

/** Elements whose content is separated from neighbouring text by a space. */
const BLOCK_TAGS: ReadonlySet<string> = new Set([
  "ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "BR", "CAPTION", "DD", "DETAILS",
  "DIV", "DL", "DT", "FIGCAPTION", "FIGURE", "H1", "H2", "H3", "H4", "H5", "H6",
  "HEADER", "HR", "LI", "MAIN", "P", "PRE", "SECTION", "SUMMARY", "TABLE",
  "TBODY", "TD", "TFOOT", "TH", "THEAD", "TR",
]);

/** Internal item: keeps the marker (bullet or number) needed for `text`. */
interface DraftItem {
  text: string;
  marker: string;
  children: DraftItem[];
}

const isList = (el: Element): boolean => LIST_TAGS.has(el.tagName.toUpperCase());

/** `<ol start>` as an integer; 1 when absent or not a number. */
function startOf(list: Element): number {
  if (list.tagName.toUpperCase() !== "OL") return 1;
  const raw = list.getAttribute("start");
  if (raw === null) return 1;
  const value = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(value) ? value : 1;
}

/**
 * Text of `li` excluding nested lists and excluded elements, with nested lists
 * collected (in document order) into `nested`.
 */
function itemContent(li: Element): { text: string; nested: Element[] } {
  const parts: string[] = [];
  const nested: Element[] = [];
  const walk = (node: Node): void => {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === TEXT_NODE || child.nodeType === CDATA_SECTION_NODE) {
        parts.push((child as CharacterData).data);
      } else if (child.nodeType === ELEMENT_NODE) {
        const el = child as Element;
        if (isExcluded(el)) continue;
        if (isList(el)) {
          nested.push(el);
          continue;
        }
        const block = BLOCK_TAGS.has(el.tagName.toUpperCase());
        if (block) parts.push(" ");
        walk(el);
        if (block) parts.push(" ");
      }
    }
  };
  walk(li);
  return { text: normalizeText(parts.join("")), nested };
}

/** Pre-order flattening of `items` and all their descendants into one level. */
function flatten(items: DraftItem[]): DraftItem[] {
  return items.flatMap((item) => [{ ...item, children: [] }, ...flatten(item.children)]);
}

/** Items of `list` at `depth` (top level = 1). */
function buildItems(list: Element, depth: number): DraftItem[] {
  const ordered = list.tagName.toUpperCase() === "OL";
  let n = depth === 1 ? startOf(list) : 1;
  const items: DraftItem[] = [];

  for (let child = list.firstElementChild; child; child = child.nextElementSibling) {
    if (isExcluded(child)) continue;
    let text = "";
    let nested: Element[];
    if (child.tagName.toUpperCase() === "LI") {
      ({ text, nested } = itemContent(child));
    } else if (isList(child)) {
      nested = [child]; // invalid but common: a list directly inside a list
    } else {
      continue;
    }

    const children = nested.flatMap((sub) => buildItems(sub, depth + 1));
    if (text === "" && (children.length === 0 || depth >= MAX_LIST_DEPTH)) {
      // Empty item: dropped. At the depth limit its descendants would become
      // its siblings anyway, so they are kept without it.
      items.push(...flatten(children));
      continue;
    }

    const marker = ordered ? `${n}.` : "-";
    n += 1;
    if (depth >= MAX_LIST_DEPTH) {
      items.push({ text, marker, children: [] }, ...flatten(children));
    } else {
      items.push({ text, marker, children });
    }
  }
  return items;
}

/** Keep the first `limit` items in pre-order; returns the kept tree. */
function truncate(items: DraftItem[], budget: { left: number }): DraftItem[] {
  const kept: DraftItem[] = [];
  for (const item of items) {
    if (budget.left <= 0) break;
    budget.left -= 1;
    kept.push({ ...item, children: truncate(item.children, budget) });
  }
  return kept;
}

function countItems(items: DraftItem[]): number {
  return items.reduce((sum, item) => sum + 1 + countItems(item.children), 0);
}

function toListItems(items: DraftItem[]): ListItem[] {
  return items.map((item) =>
    item.children.length > 0
      ? { text: item.text, children: toListItems(item.children) }
      : { text: item.text }
  );
}

function flattenedText(items: DraftItem[], indent: number, lines: string[]): void {
  for (const item of items) {
    lines.push(`${"  ".repeat(indent)}${item.marker} ${item.text}`.trimEnd());
    flattenedText(item.children, indent + 1, lines);
  }
}

/** Outermost `<ul>`/`<ol>` → one list block; a list with no items is dropped. */
export const listHandler: BlockHandler = {
  matches: (el) => isList(el),
  extract: (el): BlockOutput[] => {
    const all = buildItems(el, 1);
    if (all.length === 0) return [];

    const truncated = countItems(all) > MAX_LIST_ITEMS;
    const items = truncated ? truncate(all, { left: MAX_LIST_ITEMS }) : all;

    const lines: string[] = [];
    flattenedText(items, 0, lines);

    return [
      {
        text: lines.join("\n"),
        kind: "list",
        list: {
          ordered: el.tagName.toUpperCase() === "OL",
          start: startOf(el),
          items: toListItems(items),
          ...(truncated ? { truncated: true } : {}),
        },
      },
    ];
  },
};
