// Figure detection and resolution (spec rich-article-blocks FR-8 – FR-13).
//
// Two stages:
//   1. `figureHandler` (registered in `blocks.ts`) recognises `<figure>`,
//      standalone `<img>` / `<picture>`, and inline `<svg>` during the walk and
//      emits a `PendingFigure` — no I/O happens during the walk.
//   2. `resolveFigures` turns every `PendingFigure` into a finished `figure`
//      block: fetch (or take the inline markup) → verify format by bytes →
//      sanitize SVG → read intrinsic size → `putAsset`. Any failure, or a figure
//      beyond the 20-figure cap, becomes an unavailable figure (FR-13); it never
//      throws for an individual figure.
//
// Hashing (FR-15, RAB-14): the stored asset's sha256 is the hex segment of
// `figure.assetKey` (`content/assets/<sha>.<ext>`). Use `figureAssetSha()` to
// get it — `figure:<sha>` when non-null, else `figure:unavailable`. No side
// map is needed because the key is content-addressed.
//
// Only TYPES are imported from `./blocks` (a runtime import would create an
// import cycle with DEFAULT_HANDLERS).

import type { BlockHandler, BlockOutput, ExtractContext, ExtractedBlock, PendingFigure } from "./blocks";
import { isInsideExcluded, textOf } from "./exclusions";
import { fetchImage as defaultFetchImage, MAX_RASTER_BYTES, MAX_SVG_BYTES } from "./image-fetch";
import {
  contentTypeForFormat,
  extForFormat,
  readImageInfo,
  readSvgDimensions,
  type ImageFormat,
} from "./image-info";
import { sanitizeSvg } from "./svg-sanitize";
import { putAsset as defaultPutAsset } from "../../repository/asset";
import { ASSET_KEY_PATTERN, type FigurePayload } from "../../types/article";

/** FR-10: at most this many figures per article are fetched and stored. */
export const MAX_FIGURES = 20;
/** FR-10: image fetch concurrency. */
export const FIGURE_CONCURRENCY = 4;
/** FR-12: an inline SVG with both intrinsic dimensions ≤ this is decorative. */
export const DECORATIVE_MAX_PX = 64;

const SVG_NS = "http://www.w3.org/2000/svg";

// ── Detection ─────────────────────────────────────────────────────────────────

function isSvg(el: Element): boolean {
  return el.localName === "svg" && el.namespaceURI === SVG_NS;
}

function isImg(el: Element): boolean {
  return el.tagName === "IMG";
}

function isPicture(el: Element): boolean {
  return el.tagName === "PICTURE";
}

function attr(el: Element, name: string): string | null {
  const v = el.getAttribute(name);
  return v === null || v.trim() === "" ? null : v.trim();
}

/** The image URL attributes of an `<img>`, honouring `data-src` lazy-loading. */
function imgSource(img: Element): PendingFigure["source"] | null {
  const src = attr(img, "src");
  const dataSrc = attr(img, "data-src");
  // A data: placeholder plus data-src is the usual lazy-load pattern.
  const chosen = src !== null && !(src.startsWith("data:") && dataSrc !== null) ? src : dataSrc;
  const srcset = attr(img, "srcset") ?? attr(img, "data-srcset");
  if (chosen === null && srcset === null) return null;
  return srcset !== null ? { type: "img", src: chosen ?? "", srcset } : { type: "img", src: chosen ?? "" };
}

/** Text of the SVG's own `<title>` child, or "". */
function svgTitle(svg: Element): string {
  for (const child of Array.from(svg.children)) {
    if (child.localName === "title") return textOf(child);
  }
  return "";
}

function svgLabel(svg: Element): string {
  return (svg.getAttribute("aria-label") ?? "").trim();
}

/** FR-12 decorative test for a standalone inline SVG (aria-hidden is already excluded by the walker). */
function isDecorativeSvg(svg: Element, markup: string): boolean {
  if ((svg.getAttribute("aria-hidden") ?? "").trim().toLowerCase() === "true") return true;
  const role = (svg.getAttribute("role") ?? "").trim().toLowerCase();
  if (role === "presentation" || role === "none") return true;
  if (svg.parentElement?.closest("a, button")) return true;
  const dims = readSvgDimensions(markup);
  return dims !== null && dims.width <= DECORATIVE_MAX_PX && dims.height <= DECORATIVE_MAX_PX;
}

function pendingFromImg(img: Element, caption: string): PendingFigure | null {
  const source = imgSource(img);
  if (source === null) return null;
  return { kind: "pending-figure", source, alt: (img.getAttribute("alt") ?? "").trim(), caption };
}

function pendingFromSvg(svg: Element, markup: string, caption: string): PendingFigure {
  const title = svgTitle(svg);
  const label = svgLabel(svg);
  return {
    kind: "pending-figure",
    source: { type: "inline-svg", svg: markup },
    alt: label || title,
    caption: caption || title || label,
  };
}

/** First non-excluded image or inline SVG inside a `<figure>`. */
function figureMedia(figure: Element): Element | null {
  for (const el of Array.from(figure.querySelectorAll("img, svg"))) {
    if (!isImg(el) && !isSvg(el)) continue;
    if (isInsideExcluded(el, figure)) continue;
    // An <svg> nested inside another <svg> is part of that drawing.
    if (isSvg(el) && el.parentElement?.closest("svg")) continue;
    if (isImg(el) && imgSource(el) === null) continue;
    return el;
  }
  return null;
}

function figcaptionOf(figure: Element): Element | null {
  for (const el of Array.from(figure.querySelectorAll("figcaption"))) {
    if (!isInsideExcluded(el, figure)) return el;
  }
  return null;
}

/** Text in a figure outside its caption and media, so nothing visible is lost. */
function residualText(figure: Element, media: Element, caption: Element | null): string {
  const clone = figure.cloneNode(true) as Element;
  const all = Array.from(figure.querySelectorAll("*"));
  const cloneAll = Array.from(clone.querySelectorAll("*"));
  for (const original of [media, caption]) {
    if (original === null) continue;
    const i = all.indexOf(original);
    cloneAll[i]?.remove();
  }
  return textOf(clone);
}

function extractFigure(figure: Element): BlockOutput[] {
  const media = figureMedia(figure);
  if (media === null) return []; // unreachable: matches() requires media
  const captionEl = figcaptionOf(figure);
  const caption = captionEl ? textOf(captionEl) : "";
  const pending = isSvg(media)
    ? pendingFromSvg(media, media.outerHTML, caption)
    : pendingFromImg(media, caption);
  const out: BlockOutput[] = pending ? [pending] : [];
  const rest = residualText(figure, media, captionEl);
  if (rest) out.push({ text: rest });
  return out;
}

/**
 * Matches `<figure>` containing an image or inline SVG, a standalone `<img>`,
 * `<picture>`, or inline `<svg>`. A `<figure>` with no media is NOT matched,
 * so the walker descends into it and its content (a `<table>`, `<pre>`,
 * `<blockquote>`, figcaption text …) is handled by the other rules.
 */
export const figureHandler: BlockHandler = {
  matches: (el: Element, _ctx: ExtractContext) => {
    if (el.tagName === "FIGURE") return figureMedia(el) !== null;
    return isImg(el) || isPicture(el) || isSvg(el);
  },
  extract: (el: Element, _ctx: ExtractContext) => {
    if (el.tagName === "FIGURE") return extractFigure(el);
    if (isSvg(el)) {
      const markup = el.outerHTML;
      if (isDecorativeSvg(el, markup)) return [];
      return [pendingFromSvg(el, markup, "")];
    }
    const img = isPicture(el) ? el.querySelector("img") : el;
    if (img === null) return [];
    const pending = pendingFromImg(img, "");
    return pending ? [pending] : [];
  },
};

// ── srcset ────────────────────────────────────────────────────────────────────

/**
 * The URL to fetch for an `<img>` source: the largest `w` candidate in
 * `srcset` (else the largest `x` density), falling back to `src`.
 */
export function chooseImageUrl(source: { src: string; srcset?: string }): string {
  if (source.srcset === undefined) return source.src;
  let bestW: { url: string; n: number } | null = null;
  let bestX: { url: string; n: number } | null = null;
  for (const raw of source.srcset.split(/,\s+/)) {
    const [url, descriptor] = raw.trim().split(/\s+/);
    if (!url) continue;
    const m = /^(\d+(?:\.\d+)?)([wx])$/i.exec(descriptor ?? "1x");
    if (!m) continue;
    const n = Number(m[1]);
    if (m[2]!.toLowerCase() === "w") {
      if (bestW === null || n > bestW.n) bestW = { url, n };
    } else if (bestX === null || n > bestX.n) {
      bestX = { url, n };
    }
  }
  return bestW?.url ?? bestX?.url ?? source.src;
}

// ── Resolution ────────────────────────────────────────────────────────────────

export interface ResolveFiguresOptions {
  /** Page URL that relative image URLs resolve against. */
  baseUrl: string;
  /** Injected for tests; defaults to the SSRF-safe `fetchImage`. */
  fetchImage?: typeof defaultFetchImage;
  /** Injected for tests; defaults to the S3 `putAsset`. */
  putAsset?: typeof defaultPutAsset;
  /**
   * Overall time budget in ms for the whole call. When it elapses, every
   * figure not yet resolved becomes unavailable (`DEADLINE`) and the call
   * returns; in-flight fetches are abandoned (each still ends at its own 10 s
   * timeout, and a late `putAsset` is a harmless content-addressed write).
   * Omitted → no overall limit.
   */
  timeBudgetMs?: number;
}

type StoredAsset = { assetKey: string; format: ImageFormat; width: number; height: number };
type Outcome = { ok: true; asset: StoredAsset } | { ok: false; reason: string; host: string };

const encoder = new TextEncoder();

function failure(reason: string, host: string): Outcome {
  return { ok: false, reason, host };
}

/** Sanitize SVG text, size it from the sanitized markup, and return the bytes to store. */
function prepareSvg(svgText: string): { bytes: Uint8Array; width: number; height: number } | string {
  const sanitized = sanitizeSvg(svgText);
  if (sanitized === null) return "SVG_REJECTED";
  const dims = readSvgDimensions(sanitized);
  if (dims === null) return "DIMENSIONS_UNKNOWN";
  const bytes = encoder.encode(sanitized);
  if (bytes.length > MAX_SVG_BYTES) return "TOO_LARGE";
  return { bytes, ...dims };
}

async function store(
  put: typeof defaultPutAsset,
  bytes: Uint8Array,
  format: ImageFormat,
  width: number,
  height: number,
  host: string
): Promise<Outcome> {
  try {
    const assetKey = await put(bytes, extForFormat(format), contentTypeForFormat(format));
    return { ok: true, asset: { assetKey, format, width, height } };
  } catch {
    // Includes S3 409 ConditionalRequestConflict from a concurrent writer.
    return failure("STORE_FAILED", host);
  }
}

async function resolveInline(svg: string, put: typeof defaultPutAsset): Promise<Outcome> {
  if (encoder.encode(svg).length > MAX_SVG_BYTES) return failure("TOO_LARGE", "inline");
  const prepared = prepareSvg(svg);
  if (typeof prepared === "string") return failure(prepared, "inline");
  return store(put, prepared.bytes, "svg", prepared.width, prepared.height, "inline");
}

async function resolveRemote(
  url: URL,
  fetchImage: typeof defaultFetchImage,
  put: typeof defaultPutAsset
): Promise<Outcome> {
  const host = url.hostname;
  const maxBytes = url.pathname.toLowerCase().endsWith(".svg") ? MAX_SVG_BYTES : MAX_RASTER_BYTES;
  const res = await fetchImage(url.toString(), { maxBytes });
  if (!res.ok) return failure(res.reason, host);

  const info = readImageInfo(res.bytes);
  if (info === null) return failure("UNRECOGNIZED_IMAGE", host);
  if (info.format !== "svg") return store(put, res.bytes, info.format, info.width, info.height, host);

  if (res.bytes.length > MAX_SVG_BYTES) return failure("TOO_LARGE", host);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(res.bytes);
  } catch {
    return failure("UNRECOGNIZED_IMAGE", host);
  }
  const prepared = prepareSvg(text);
  if (typeof prepared === "string") return failure(prepared, host);
  return store(put, prepared.bytes, "svg", prepared.width, prepared.height, host);
}

function figureBlock(pending: PendingFigure, asset: StoredAsset | null): ExtractedBlock {
  const { alt, caption } = pending;
  const text = caption || alt || "Figure";
  const figure: FigurePayload = asset
    ? { ...asset, alt, caption }
    : { assetKey: null, format: null, width: null, height: null, alt, caption, unavailable: true };
  return { kind: "figure", text, figure };
}

function logUnavailable(reason: string, host: string): void {
  // Host only — never the path or query string.
  console.warn(JSON.stringify({ level: "warn", message: "figure unavailable", reason, host }));
}

/**
 * Replace every `PendingFigure` in `outputs` with a finished `figure` block,
 * preserving order. Other outputs pass through unchanged. Fetches run with
 * concurrency `FIGURE_CONCURRENCY`; figures after the first `MAX_FIGURES` are
 * unavailable without being fetched; identical URLs (and identical inline SVG
 * markup) within one call are fetched/stored once. Never rejects because of an
 * individual figure.
 */
export async function resolveFigures(
  outputs: BlockOutput[],
  opts: ResolveFiguresOptions
): Promise<ExtractedBlock[]> {
  const fetchImage = opts.fetchImage ?? defaultFetchImage;
  const put = opts.putAsset ?? defaultPutAsset;
  const result: (ExtractedBlock | undefined)[] = new Array(outputs.length);
  const jobs: { index: number; pending: PendingFigure }[] = [];

  let figureCount = 0;
  outputs.forEach((output, index) => {
    if (output.kind !== "pending-figure") {
      result[index] = output;
      return;
    }
    figureCount++;
    if (figureCount > MAX_FIGURES) {
      logUnavailable("FIGURE_CAP", "-");
      result[index] = figureBlock(output, null);
    } else {
      jobs.push({ index, pending: output });
    }
  });

  const memo = new Map<string, Promise<Outcome>>();
  const resolveOne = (pending: PendingFigure): Promise<Outcome> => {
    const source = pending.source;
    let key: string;
    let run: () => Promise<Outcome>;
    if (source.type === "inline-svg") {
      key = `inline:${source.svg}`;
      run = () => resolveInline(source.svg, put);
    } else {
      const chosen = chooseImageUrl(source);
      if (chosen === "") return Promise.resolve(failure("INVALID_URL", "-"));
      let url: URL;
      try {
        url = new URL(chosen, opts.baseUrl);
      } catch {
        return Promise.resolve(failure("INVALID_URL", "-"));
      }
      key = `url:${url.toString()}`;
      run = () => resolveRemote(url, fetchImage, put);
    }
    let promise = memo.get(key);
    if (promise === undefined) {
      promise = run().catch(() => failure("UNEXPECTED_ERROR", "-"));
      memo.set(key, promise);
    }
    return promise;
  };

  // Overall deadline: a single timer that every pending resolution races.
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline: Promise<Outcome> | null =
    opts.timeBudgetMs === undefined
      ? null
      : new Promise<Outcome>((resolve) => {
          timer = setTimeout(() => {
            expired = true;
            resolve(failure("DEADLINE", "-"));
          }, Math.max(0, opts.timeBudgetMs!));
        });

  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < jobs.length) {
      const job = jobs[next++]!;
      const outcome = expired
        ? failure("DEADLINE", "-")
        : await (deadline ? Promise.race([resolveOne(job.pending), deadline]) : resolveOne(job.pending));
      if (!outcome.ok) logUnavailable(outcome.reason, outcome.host);
      result[job.index] = figureBlock(job.pending, outcome.ok ? outcome.asset : null);
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(FIGURE_CONCURRENCY, jobs.length) }, worker));
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }

  return result as ExtractedBlock[];
}

/**
 * sha256 of a figure's stored asset (the hex segment of its content-addressed
 * key), or null when the figure is unavailable. RAB-14 hashes this as
 * `figure:<sha>` / `figure:unavailable` (FR-15).
 */
export function figureAssetSha(figure: FigurePayload): string | null {
  if (figure.unavailable === true || figure.assetKey === null) return null;
  if (!ASSET_KEY_PATTERN.test(figure.assetKey)) return null;
  return figure.assetKey.slice("content/assets/".length, "content/assets/".length + 64);
}
