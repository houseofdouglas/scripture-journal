// Block walker (spec rich-article-blocks FR-3, FR-4, FR-14 exclusions).
//
// `extractBlocks(root)` walks the content root once, depth-first, in document
// order. For every element it:
//   1. skips the whole subtree if the element is excluded (`exclusions.ts`);
//   2. skips it if it is already covered (`ctx.markCovered`);
//   3. tries each handler in registration order — the FIRST handler whose
//      `matches` returns true handles the element: its `extract` outputs are
//      appended at this position and the walker does NOT descend into it;
//   4. otherwise descends into its children.
// Every non-whitespace text node reached by the walk (i.e. not inside an
// excluded, covered, or handled element) is passed to `onUncoveredText`.
//
// ── Adding a handler (RAB-05 list, RAB-06 code, RAB-07 table, RAB-13 figure) ──
//
// 1. Create `./<name>.ts` exporting `export const <name>Handler: BlockHandler`.
//    Import ONLY TYPES from this file (`import type { BlockHandler, ... } from
//    "./blocks"`). Runtime helpers (`textOf`, `normalizeText`, `isExcluded`,
//    `isInsideExcluded`) come from `./exclusions` or from the `ctx` argument.
//    A runtime import of `./blocks` from a handler module creates an import
//    cycle with DEFAULT_HANDLERS and will throw at load time.
// 2. In this file, uncomment YOUR import line in the "Handler imports" block
//    and YOUR entry line in DEFAULT_HANDLERS. Touch nothing else in those
//    blocks; each slot is separated by an unchanged comment line so parallel
//    branches merge without conflicts.
// 3. `extract` returns zero or more outputs. Return `[]` to drop an element
//    (e.g. an empty list) — it is still treated as handled, so nothing inside
//    it is emitted by any other rule. If a handler wants the walker to descend
//    instead, its `matches` must return false.
//
// Covered marking: the walker marks a matched element covered before calling
// `extract`, so handlers need not do it themselves (doing so is harmless).
// Handlers may additionally mark other nodes covered (e.g. a figure handler
// consuming a sibling caption); the walker skips covered nodes it reaches later.
//
// ── Precedence ──
//
// Container handlers (list, table, code `<pre>`, figure) MUST be registered
// BEFORE `headingHandler` and `paragraphHandler`. The walker handles the
// outermost match first and never descends into it, so a `<p>` inside `<li>`,
// `<td>`, or `<figcaption>` is never emitted separately — but only if the
// container's handler is reached before the walker gets down to the `<p>`.
// Since outer elements are visited before inner ones, registration order only
// matters between handlers that could match the SAME element.
//
// ── Uncovered text (RAB-08 catch-all) ──
//
// `onUncoveredText(text, ctx)` is called, in document order, for each
// non-whitespace text node the walk reaches that is not inside a handled,
// covered, or excluded element. Its returned outputs are inserted at that
// position in the output. To group a run of inline content into one block, the
// callback can gather the following text nodes itself and `ctx.markCovered()`
// them (or their inline wrapper elements); the walker then skips them. The
// default (DEFAULT_ON_UNCOVERED_TEXT) is a no-op, so such text is dropped
// until RAB-08 replaces that one line.

import type { ArticleParagraph } from "../../types/article";
import { isExcluded, normalizeText, textOf as textOfElement } from "./exclusions";

// ── Handler imports ──────────────────────────────────────────────────────────
// RAB-05 (list):
// import { listHandler } from "./list";
// RAB-06 (code):
// import { codeHandler } from "./code";
// RAB-07 (table):
// import { tableHandler } from "./table";
// RAB-13 (figure):
import { figureHandler } from "./figure";
// RAB-08 (catch-all):
// import { uncoveredTextHandler } from "./catch-all";
// ── end handler imports ──────────────────────────────────────────────────────

// ── Types ─────────────────────────────────────────────────────────────────────

/** A finished block, minus the `index` assigned when the article is assembled. */
export type ExtractedBlock = Omit<ArticleParagraph, "index">;

/** A figure whose asset has not yet been fetched/serialized, sized, and stored. */
export type PendingFigure = {
  kind: "pending-figure";
  source: { type: "img"; src: string; srcset?: string } | { type: "inline-svg"; svg: string };
  alt: string;
  caption: string;
};

export type BlockOutput = ExtractedBlock | PendingFigure;

export interface ExtractContext {
  /** The content root being walked. */
  readonly root: Element;
  /** Mark a node (and so its whole subtree) as covered; the walker skips it. */
  markCovered(node: Node): void;
  /** True if `node` or any ancestor up to `root` has been marked covered. */
  isCovered(node: Node): boolean;
  /** Normalized plain text of `el`, excluding excluded descendants. */
  textOf(el: Element): string;
}

export interface BlockHandler {
  matches(el: Element, ctx: ExtractContext): boolean;
  extract(el: Element, ctx: ExtractContext): BlockOutput[];
}

/** Called for each uncovered, non-whitespace text node; see header comment. */
export type UncoveredTextCallback = (text: Text, ctx: ExtractContext) => BlockOutput[] | void;

export interface ExtractOptions {
  /** Defaults to DEFAULT_ON_UNCOVERED_TEXT. */
  onUncoveredText?: UncoveredTextCallback;
}

// ── Built-in handlers ─────────────────────────────────────────────────────────

/** `<p>` → text block; empty paragraphs are dropped. */
export const paragraphHandler: BlockHandler = {
  matches: (el) => el.tagName === "P",
  extract: (el, ctx) => {
    const text = ctx.textOf(el);
    return text ? [{ text }] : [];
  },
};

const HEADING_LEVELS: Readonly<Record<string, 2 | 3 | 4 | 5 | 6>> = {
  H1: 2, // FR-4: the page title is the only real h1; a body h1 is stored as level 2
  H2: 2,
  H3: 3,
  H4: 4,
  H5: 5,
  H6: 6,
};

/** `<h1>`–`<h6>` → heading block (h1 → level 2); empty headings are dropped. */
export const headingHandler: BlockHandler = {
  matches: (el) => el.tagName in HEADING_LEVELS,
  extract: (el, ctx) => {
    const level = HEADING_LEVELS[el.tagName];
    const text = ctx.textOf(el);
    if (level === undefined || !text) return [];
    return [{ text, kind: "heading", heading: { level } }];
  },
};

// ── Registry ──────────────────────────────────────────────────────────────────

/**
 * Handlers in precedence order. Containers first (see "Precedence" above),
 * then headings, then paragraphs last.
 */
export const DEFAULT_HANDLERS: readonly BlockHandler[] = [
  // RAB-05 (list):
  // listHandler,
  // RAB-06 (code):
  // codeHandler,
  // RAB-07 (table):
  // tableHandler,
  // RAB-13 (figure):
  figureHandler,
  // ── built-ins (keep last) ──
  headingHandler,
  paragraphHandler,
];

/** RAB-08 replaces this with its catch-all callback (e.g. `uncoveredTextHandler`). */
export const DEFAULT_ON_UNCOVERED_TEXT: UncoveredTextCallback = () => [];

// ── Walker ────────────────────────────────────────────────────────────────────

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

export function createExtractContext(root: Element): ExtractContext {
  const covered = new Set<Node>();
  return {
    root,
    markCovered(node) {
      covered.add(node);
    },
    isCovered(node) {
      for (let current: Node | null = node; current; current = current.parentNode) {
        if (covered.has(current)) return true;
        if (current === root) return false;
      }
      return false;
    },
    textOf: textOfElement,
  };
}

/**
 * Walk `root` in document order and return its blocks. `root` itself is never
 * offered to the handlers (it is the container being walked) but its
 * exclusion is honoured.
 */
export function extractBlocks(
  root: Element,
  handlers: readonly BlockHandler[] = DEFAULT_HANDLERS,
  options: ExtractOptions = {}
): BlockOutput[] {
  const onUncoveredText = options.onUncoveredText ?? DEFAULT_ON_UNCOVERED_TEXT;
  const ctx = createExtractContext(root);
  const outputs: BlockOutput[] = [];
  if (isExcluded(root)) return outputs;

  const visitChildren = (parent: Node): void => {
    for (let child = parent.firstChild; child; child = child.nextSibling) {
      if (ctx.isCovered(child)) continue;

      if (child.nodeType === TEXT_NODE) {
        const text = child as Text;
        if (normalizeText(text.data) === "") continue;
        const extra = onUncoveredText(text, ctx);
        if (extra) outputs.push(...extra);
        continue;
      }

      if (child.nodeType !== ELEMENT_NODE) continue;
      const el = child as Element;
      if (isExcluded(el)) continue;

      const handler = handlers.find((h) => h.matches(el, ctx));
      if (handler) {
        ctx.markCovered(el);
        outputs.push(...handler.extract(el, ctx));
      } else {
        visitChildren(el);
      }
    }
  };

  visitChildren(root);
  return outputs;
}
