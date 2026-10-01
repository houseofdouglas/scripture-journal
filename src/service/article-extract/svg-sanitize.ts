import createDOMPurify from "dompurify";
import type { Config, WindowLike } from "dompurify";
import { JSDOM } from "jsdom";
import { readSvgDimensions } from "./image-info";

// Server-side SVG sanitizer (spec rich-article-blocks FR-11, FR-9).
//
// Defence in depth: the output is only ever rendered through `<img>` (no
// script execution, no external loads) and served with a restrictive CSP and
// `nosniff` (FR-25). This module is the first layer and must not rely on them.
//
// Pipeline:
//   1. Structural pre-check: the input must be a single `<svg>` root element.
//   2. DOMPurify (SVG + SVG-filters profiles) on a jsdom window, with hooks that
//      restrict href/xlink:href and clean CSS in attributes.
//   3. Post-pass: remove href-targeting animations, clean `<style>` text, write
//      width/height from `readSvgDimensions`, require something drawable.
//   4. Serialize as XML (the serializer adds `xmlns` / `xmlns:xlink`).

const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";
const XMLNS_NS = "http://www.w3.org/2000/xmlns/";

const { window } = new JSDOM("");
const purify = createDOMPurify(window as unknown as WindowLike);

const FRAGMENT_RE = /^#[A-Za-z0-9_.:-]+$/;
const RASTER_DATA_URI_RE = /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/i;

const ANIMATION_TAGS = new Set([
  "animate",
  "set",
  "animatecolor",
  "animatemotion",
  "animatetransform",
  "discard",
]);

const SHAPE_TAGS = new Set(["path", "rect", "circle", "ellipse", "line", "polyline", "polygon"]);

// Children of these are never rendered directly (only via reference).
const NON_RENDERING_TAGS = new Set([
  "defs",
  "symbol",
  "marker",
  "clippath",
  "mask",
  "pattern",
  "lineargradient",
  "radialgradient",
  "filter",
  "metadata",
  "title",
  "desc",
  "style",
]);

const PURIFY_CONFIG: Config = {
  USE_PROFILES: { svg: true, svgFilters: true },
  // `<use>` is not in DOMPurify's SVG profile; we allow it and restrict its
  // href to internal fragments below.
  ADD_TAGS: ["use"],
  FORBID_TAGS: [
    "script",
    "foreignobject",
    "foreignObject",
    "iframe",
    "embed",
    "object",
    "set",
    "animate",
    "discard",
  ],
  ALLOW_UNKNOWN_PROTOCOLS: false,
};

// ── href / CSS rules ──────────────────────────────────────────────────────────

function isHrefAttr(name: string): boolean {
  const lc = name.toLowerCase();
  return lc === "href" || lc === "xlink:href";
}

/** Returns the permitted (normalized) href value, or null to remove it. */
function allowedHref(value: string): string | null {
  const trimmed = value.trim();
  if (FRAGMENT_RE.test(trimmed)) return trimmed;
  const compact = trimmed.replace(/\s+/g, "");
  if (RASTER_DATA_URI_RE.test(compact)) return compact;
  return null;
}

/** Finds the end index (exclusive) of a `url(` token starting at `open` (index of "("). */
function urlTokenEnd(css: string, open: number): { end: number; inner: string } {
  let i = open + 1;
  while (i < css.length && /\s/.test(css[i]!)) i++;
  const quote = css[i];
  if (quote === '"' || quote === "'") {
    const close = css.indexOf(quote, i + 1);
    if (close === -1) return { end: css.length, inner: css.slice(i + 1) };
    const inner = css.slice(i + 1, close);
    const paren = css.indexOf(")", close + 1);
    return { end: paren === -1 ? css.length : paren + 1, inner };
  }
  const paren = css.indexOf(")", i);
  if (paren === -1) return { end: css.length, inner: css.slice(i) };
  return { end: paren + 1, inner: css.slice(i, paren) };
}

/**
 * Cleans CSS text (a `<style>` body, a `style` attribute, or a presentation
 * attribute value). Removes `@import` rules and every `url(...)` that is not an
 * internal `url(#id)`. Returns null when the text cannot be safely cleaned
 * (CSS escapes, which could spell `url`/`@import` in disguise, or fetching
 * functions that take bare strings such as `image-set()`).
 */
function cleanCss(input: string): string | null {
  if (input.includes("\\")) return null;
  let css = input.replace(/\/\*[\s\S]*?\*\//g, "");
  if (css.includes("/*")) css = css.slice(0, css.indexOf("/*"));

  if (/(?:-webkit-)?image-set\s*\(|\bimage\s*\(|\bsrc\s*\(|\bcross-fade\s*\(|expression\s*\(/i.test(css)) {
    return null;
  }

  // Drop @import rules (up to the next ';' or end of text).
  css = css.replace(/@import[^;]*(?:;|$)/gi, "");
  if (/@import/i.test(css)) return null;

  // Rewrite url(...) tokens.
  let out = "";
  let pos = 0;
  const urlRe = /url\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = urlRe.exec(css)) !== null) {
    const open = m.index + m[0].length - 1;
    const { end, inner } = urlTokenEnd(css, open);
    const ref = inner.trim();
    out += css.slice(pos, m.index);
    out += FRAGMENT_RE.test(ref) ? `url(${ref})` : "none";
    pos = end;
    urlRe.lastIndex = end;
  }
  out += css.slice(pos);
  return out;
}

const CSS_SUSPICIOUS_RE = /url\s*\(|\\|@import|image-set|\bimage\s*\(|\bsrc\s*\(|cross-fade|expression\s*\(/i;

purify.addHook("uponSanitizeAttribute", (_node, data) => {
  const name = data.attrName;
  if (/^on/i.test(name)) {
    data.keepAttr = false;
    return;
  }
  if (isHrefAttr(name)) {
    const allowed = allowedHref(data.attrValue);
    if (allowed === null) {
      data.keepAttr = false;
    } else {
      data.attrValue = allowed;
    }
    return;
  }
  if (name.toLowerCase() === "style" || CSS_SUSPICIOUS_RE.test(data.attrValue)) {
    const cleaned = cleanCss(data.attrValue);
    if (cleaned === null) {
      data.keepAttr = false;
    } else {
      data.attrValue = cleaned;
    }
  }
});

// ── Structure helpers ─────────────────────────────────────────────────────────

function lcName(el: Element): string {
  return el.localName.toLowerCase();
}

/** True if `input` parses (HTML fragment rules) to exactly one `<svg>` element. */
function hasSingleSvgRoot(input: string): boolean {
  const tpl = window.document.createElement("template");
  tpl.innerHTML = input;
  let svgCount = 0;
  for (const node of Array.from(tpl.content.childNodes)) {
    if (node.nodeType === window.Node.ELEMENT_NODE) {
      const el = node as Element;
      if (el.namespaceURI !== SVG_NS || lcName(el) !== "svg") return false;
      svgCount++;
    } else if (node.nodeType === window.Node.TEXT_NODE) {
      if ((node.textContent ?? "").trim() !== "") return false;
    }
    // Comments (incl. a parsed `<?xml ...?>` prolog) are ignored.
  }
  return svgCount === 1;
}

function getHref(el: Element): string | null {
  for (const attr of Array.from(el.attributes)) {
    if (isHrefAttr(attr.name)) return attr.value;
  }
  return null;
}

function findById(root: Element, id: string): Element | null {
  for (const el of Array.from(root.querySelectorAll("*"))) {
    if (el.getAttribute("id") === id) return el;
  }
  return null;
}

function isDrawableLeaf(el: Element, root: Element, depth: number): boolean {
  const name = lcName(el);
  if (SHAPE_TAGS.has(name)) return true;
  if (name === "text") return (el.textContent ?? "").trim() !== "";
  if (name === "image") {
    const href = getHref(el);
    return href !== null && href.startsWith("data:");
  }
  if (name === "use") {
    if (depth > 8) return false;
    const href = getHref(el);
    if (href === null || !href.startsWith("#")) return false;
    const target = findById(root, href.slice(1));
    if (target === null || target === el || target.contains(el)) return false;
    return containsDrawable(target, root, depth + 1);
  }
  return false;
}

/** True if `el` itself or any descendant is drawable (ignores rendering context). */
function containsDrawable(el: Element, root: Element, depth: number): boolean {
  if (isDrawableLeaf(el, root, depth)) return true;
  for (const child of Array.from(el.querySelectorAll("*"))) {
    if (isDrawableLeaf(child, root, depth)) return true;
  }
  return false;
}

function isInNonRenderingContainer(el: Element, root: Element): boolean {
  for (let p = el.parentElement; p !== null && p !== root; p = p.parentElement) {
    if (NON_RENDERING_TAGS.has(lcName(p))) return true;
  }
  return false;
}

function hasRenderedDrawable(root: Element): boolean {
  for (const el of Array.from(root.querySelectorAll("*"))) {
    if (isInNonRenderingContainer(el, root)) continue;
    if (NON_RENDERING_TAGS.has(lcName(el))) continue;
    if (isDrawableLeaf(el, root, 0)) return true;
  }
  return false;
}

// ── Dimensions ────────────────────────────────────────────────────────────────

/**
 * Writes explicit integer width/height onto the root using `readSvgDimensions`
 * — the same reader that sizes the stored figure — so the stored attributes
 * always equal the figure's recorded dimensions (including when only one side
 * is absolute and the other is derived from the viewBox ratio). Left untouched
 * when the size cannot be determined; the figure is then unavailable.
 */
function ensureDimensions(svg: Element): void {
  const rootTag = new window.XMLSerializer().serializeToString(svg.cloneNode(false));
  const dims = readSvgDimensions(rootTag);
  if (dims === null) return;
  svg.setAttribute("width", String(dims.width));
  svg.setAttribute("height", String(dims.height));
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Sanitizes an SVG document or inline-SVG fragment for storage as a standalone
 * image asset. Returns serialized XML, or null if the input is not a single
 * `<svg>` root or nothing drawable remains after sanitizing.
 */
export function sanitizeSvg(svgText: string): string | null {
  if (typeof svgText !== "string" || svgText.trim() === "") return null;
  if (!hasSingleSvgRoot(svgText)) return null;

  // RETURN_DOM yields the <body> element holding the sanitized markup.
  const body = purify.sanitize(svgText, { ...PURIFY_CONFIG, RETURN_DOM: true }) as Element;
  const roots = Array.from(body.children);
  if (roots.length !== 1) return null;
  const svg = roots[0]!;
  if (svg.namespaceURI !== SVG_NS || lcName(svg) !== "svg") return null;

  // Animations that target href (FR-11). `set`/`animate` are already forbidden;
  // this catches animateTransform/animateMotion/animateColor misuse.
  for (const el of Array.from(svg.querySelectorAll("*"))) {
    if (!ANIMATION_TAGS.has(lcName(el))) continue;
    const target = Array.from(el.attributes).find((a) => a.name.toLowerCase() === "attributename");
    if (target === undefined || /(^|:)href$/i.test(target.value.trim())) el.remove();
  }

  // `<style>` bodies: strip @import and non-fragment url().
  for (const style of Array.from(svg.querySelectorAll("style"))) {
    const cleaned = cleanCss(style.textContent ?? "");
    if (cleaned === null) {
      style.remove();
    } else {
      style.textContent = cleaned;
    }
  }

  if (!hasRenderedDrawable(svg)) return null;

  ensureDimensions(svg);

  // Declare the xlink prefix on the root so the serializer emits `xlink:href`
  // rather than a generated `ns1:` prefix on each element.
  const usesXlink = Array.from(svg.querySelectorAll("*"))
    .concat(svg)
    .some((el) => Array.from(el.attributes).some((a) => a.namespaceURI === XLINK_NS));
  if (usesXlink) svg.setAttributeNS(XMLNS_NS, "xmlns:xlink", XLINK_NS);

  return new window.XMLSerializer().serializeToString(svg);
}
