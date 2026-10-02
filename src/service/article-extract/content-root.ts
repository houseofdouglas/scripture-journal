// Content-root selection (spec rich-article-blocks FR-2).
//
// `.body-block` wins outright (churchofjesuschrist.org). Otherwise the fallback
// is the first of <article> → <main> → <body>, and the root is the densest
// content container inside it: the element (fallback included) whose direct
// block-level children hold the most trimmed text. Ties go to the outermost
// element. If no element reaches MIN_CONTENT_ROOT_SCORE, the fallback is used.

export const MIN_CONTENT_ROOT_SCORE = 500;

const SCORED_CHILD_TAGS: ReadonlySet<string> = new Set([
  "P",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "UL",
  "OL",
  "PRE",
  "TABLE",
  "FIGURE",
  "BLOCKQUOTE",
]);

export function selectContentRoot(doc: Document): Element {
  const bodyBlock = doc.querySelector(".body-block");
  if (bodyBlock) return bodyBlock;

  const fallback: Element =
    doc.querySelector("article") ??
    doc.querySelector("main") ??
    doc.body ??
    doc.documentElement;

  // One pass over the fallback's descendants: each scored element adds its
  // text length to its parent's score. Every element has one parent, so each
  // scored subtree's text is read once per scored element.
  const scores = new Map<Element, number>();
  for (const el of fallback.querySelectorAll("*")) {
    if (!SCORED_CHILD_TAGS.has(el.tagName)) continue;
    const parent = el.parentElement;
    if (!parent) continue;
    const len = (el.textContent ?? "").trim().length;
    if (len === 0) continue;
    scores.set(parent, (scores.get(parent) ?? 0) + len);
  }

  let best: Element | null = null;
  let bestScore = -1;
  for (const [el, score] of scores) {
    if (
      score > bestScore ||
      (score === bestScore && best !== null && precedes(el, best))
    ) {
      best = el;
      bestScore = score;
    }
  }

  if (!best || bestScore < MIN_CONTENT_ROOT_SCORE) return fallback;
  return best;
}

// True when `a` comes before `b` in document order (an ancestor precedes its
// descendants), so the earliest element is the outermost on a tie.
function precedes(a: Element, b: Element): boolean {
  // DOCUMENT_POSITION_FOLLOWING = 4: `b` follows `a`.
  return (a.compareDocumentPosition(b) & 4) !== 0;
}
