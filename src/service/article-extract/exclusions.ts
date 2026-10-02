// Global exclusion rules (spec rich-article-blocks FR-14, FR-12).
//
// An excluded element contributes nothing — no block, no text — under any
// rule: structured handlers, catch-all text, or `textOf`. The walker in
// `blocks.ts` skips excluded subtrees entirely.
//
// This module has no runtime imports from `blocks.ts`, so handler modules can
// import `textOf` / `normalizeText` from here without creating an import cycle
// with the handler registry.

// Node type constants (avoid depending on a global `Node` in non-DOM runtimes).
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const CDATA_SECTION_NODE = 4;

const EXCLUDED_TAGS: ReadonlySet<string> = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "TEMPLATE",
  "BUTTON",
  "INPUT",
  "SELECT",
  "TEXTAREA",
  "LABEL",
  "NAV",
  "FOOTER",
]);

const EXCLUDED_ROLES: ReadonlySet<string> = new Set(["doc-endnotes", "doc-footnote"]);

const DISPLAY_NONE = /(?:^|;)\s*display\s*:\s*none\s*(?:!important\s*)?(?:;|$)/i;
const VISIBILITY_HIDDEN = /(?:^|;)\s*visibility\s*:\s*hidden\s*(?:!important\s*)?(?:;|$)/i;

/** True when `el` itself matches an exclusion rule (ancestors not considered). */
export function isExcluded(el: Element): boolean {
  // tagName is upper-case for HTML elements; SVG/MathML elements keep their
  // own case, so normalise.
  if (EXCLUDED_TAGS.has(el.tagName.toUpperCase())) return true;

  const role = el.getAttribute("role");
  if (role !== null && EXCLUDED_ROLES.has(role.trim().toLowerCase())) return true;

  if (el.classList.contains("footnotes")) return true;
  if (el.hasAttribute("hidden")) return true;
  // Applies to any element, including the decorative aria-hidden SVG icons.
  if ((el.getAttribute("aria-hidden") ?? "").trim().toLowerCase() === "true") return true;

  const style = el.getAttribute("style");
  if (style !== null && (DISPLAY_NONE.test(style) || VISIBILITY_HIDDEN.test(style))) return true;

  return false;
}

/**
 * True when `node` (if it is an element) or any ancestor element is excluded.
 * The walk stops after checking `root` (inclusive); without `root` it walks to
 * the document.
 */
export function isInsideExcluded(node: Node, root?: Element): boolean {
  let current: Node | null = node;
  while (current) {
    if (current.nodeType === ELEMENT_NODE && isExcluded(current as Element)) return true;
    if (current === root) return false;
    current = current.parentNode;
  }
  return false;
}

/** Collapse every run of whitespace (`\s`, which includes NBSP) to one space and trim. */
export function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

// ── Leading-label separator ──────────────────────────────────────────────────
//
// Pages often render a short label on its own line purely through CSS, e.g.
// `<div><small>Traditional</small>An idea passes…</div>` with
// `small { display: block }`. CSS is not consulted, so textContent-style
// joining yields "TraditionalAn idea…". Narrow rule: when a LABEL_TAGS element
// is the first content of a text run, and the text after it starts with an
// uppercase letter or digit, a space is inserted after it. Mid-run elements
// (footnote markers like `marker<sup>1</sup>.`) and lowercase continuations
// (`<b>Un</b>believable`) are left joined.

const LABEL_TAGS: ReadonlySet<string> = new Set(["SMALL", "B", "STRONG"]);

/** Placeholder pushed after a leading label; resolved by `joinParts`. */
export const LABEL_BREAK = "\uE000"; // private-use char; never in source text after normalization

/** True when `el` is one of the label elements the separator rule applies to. */
export function isLabelElement(el: Element): boolean {
  return LABEL_TAGS.has(el.tagName.toUpperCase());
}

/** True when `el` is a label element and `partsSoFar` holds no text yet. */
export function isLeadingLabel(el: Element, partsSoFar: readonly string[]): boolean {
  return isLabelElement(el) && partsSoFar.join("").trim() === "";
}

/** Join collected parts, turning LABEL_BREAKs into spaces before an uppercase letter or digit. */
export function joinParts(parts: readonly string[]): string {
  return normalizeText(
    parts.join("").replace(/\uE000+(?=\s*[\p{Lu}\p{N}])/gu, " ").replace(/\uE000/gu, "")
  );
}

/**
 * Normalized plain text of `el`, skipping excluded descendants (and returning
 * "" if `el` itself is excluded). Concatenates text nodes like `textContent`
 * (no separators are inserted between elements, except after a leading label —
 * see `joinParts`), then collapses whitespace.
 */
export function textOf(el: Element): string {
  if (isExcluded(el)) return "";
  const parts: string[] = [];
  collectText(el, parts);
  return joinParts(parts);
}

function collectText(node: Node, parts: string[]): void {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.nodeType === TEXT_NODE || child.nodeType === CDATA_SECTION_NODE) {
      parts.push((child as CharacterData).data);
    } else if (child.nodeType === ELEMENT_NODE) {
      const childEl = child as Element;
      if (isExcluded(childEl)) continue;
      const leading = isLeadingLabel(childEl, parts);
      collectText(child, parts);
      if (leading) parts.push(LABEL_BREAK);
    }
  }
}
