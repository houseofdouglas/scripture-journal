import type { AssetExt } from "../../types/article";

// Image format and intrinsic-dimension reader (spec rich-article-blocks FR-9).
//
// Raster formats are identified by magic bytes and sized from their headers;
// nothing is decoded. Every read is bounds-checked, and malformed or truncated
// input yields `null` rather than throwing. No third-party dependency.

export type ImageFormat = "png" | "jpeg" | "gif" | "webp" | "svg";

export interface ImageInfo {
  format: ImageFormat;
  width: number;
  height: number;
}

/** Largest dimension we accept from any header (guards against garbage values). */
const MAX_DIMENSION = 0x7fffffff;

function validDims(width: number, height: number): boolean {
  return (
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    width > 0 &&
    height > 0 &&
    width <= MAX_DIMENSION &&
    height <= MAX_DIMENSION
  );
}

function startsWith(bytes: Uint8Array, sig: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + sig.length) return false;
  return sig.every((b, i) => bytes[offset + i] === b);
}

function ascii(s: string): number[] {
  return Array.from(s, (c) => c.charCodeAt(0));
}

// ── Raster parsers ────────────────────────────────────────────────────────────

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function readPng(bytes: Uint8Array, view: DataView): ImageInfo | null {
  // Signature (8) + IHDR length (4) + "IHDR" (4) + width (4) + height (4).
  if (bytes.length < 24) return null;
  if (view.getUint32(8) !== 13 || !startsWith(bytes, ascii("IHDR"), 12)) return null;
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  return validDims(width, height) ? { format: "png", width, height } : null;
}

function isJpegSof(marker: number): boolean {
  // SOF0–SOF15, excluding DHT (C4), JPG (C8), and DAC (CC).
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

function readJpeg(bytes: Uint8Array, view: DataView): ImageInfo | null {
  let i = 2; // past SOI (FF D8)
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    // Skip fill bytes (any run of 0xFF before the marker code).
    while (i < bytes.length && bytes[i] === 0xff) i++;
    if (i >= bytes.length) return null;
    const marker = bytes[i] ?? 0;
    i++;

    // Standalone markers: no length field.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    // EOI or start-of-scan before any SOF: no frame header to read.
    if (marker === 0xd9 || marker === 0xda) return null;

    if (i + 2 > bytes.length) return null;
    const length = view.getUint16(i);
    if (length < 2) return null;

    if (isJpegSof(marker)) {
      // Segment: length (2), precision (1), height (2), width (2).
      if (length < 7 || i + 7 > bytes.length) return null;
      const height = view.getUint16(i + 3);
      const width = view.getUint16(i + 5);
      // Height 0 means "defined later by DNL" — treat as unknown.
      return validDims(width, height) ? { format: "jpeg", width, height } : null;
    }
    i += length;
  }
  return null;
}

function readGif(bytes: Uint8Array, view: DataView): ImageInfo | null {
  // Header (6) + logical screen width (2, LE) + height (2, LE).
  if (bytes.length < 10) return null;
  const width = view.getUint16(6, true);
  const height = view.getUint16(8, true);
  return validDims(width, height) ? { format: "gif", width, height } : null;
}

function readWebp(bytes: Uint8Array, view: DataView): ImageInfo | null {
  // "RIFF" size "WEBP" then the first chunk: fourcc (4) + size (4) + data.
  if (bytes.length < 20) return null;
  const data = 20;
  let width: number;
  let height: number;

  if (startsWith(bytes, ascii("VP8 "), 12)) {
    // Lossy: frame tag (3), start code 9D 01 2A, then 14-bit width/height (LE).
    if (bytes.length < data + 10) return null;
    if (!startsWith(bytes, [0x9d, 0x01, 0x2a], data + 3)) return null;
    width = view.getUint16(data + 6, true) & 0x3fff;
    height = view.getUint16(data + 8, true) & 0x3fff;
  } else if (startsWith(bytes, ascii("VP8L"), 12)) {
    // Lossless: signature 0x2F, then 14-bit (width-1) and 14-bit (height-1).
    if (bytes.length < data + 5) return null;
    if (bytes[data] !== 0x2f) return null;
    const bits = view.getUint32(data + 1, true);
    width = (bits & 0x3fff) + 1;
    height = ((bits >>> 14) & 0x3fff) + 1;
  } else if (startsWith(bytes, ascii("VP8X"), 12)) {
    // Extended: flags (1) + reserved (3), then 24-bit (width-1), 24-bit (height-1).
    if (bytes.length < data + 10) return null;
    const u24 = (o: number): number =>
      (bytes[o] ?? 0) | ((bytes[o + 1] ?? 0) << 8) | ((bytes[o + 2] ?? 0) << 16);
    width = u24(data + 4) + 1;
    height = u24(data + 7) + 1;
  } else {
    return null;
  }
  return validDims(width, height) ? { format: "webp", width, height } : null;
}

// ── SVG ───────────────────────────────────────────────────────────────────────
//
// Why a hand-rolled scan of the root start tag rather than jsdom: we only need
// three attributes on one element, this runs on every imported image, and
// jsdom is heavy to spin up per call. The scan skips the XML prolog explicitly
// and reads attributes with quote-aware matching, so it is not fooled by `<svg`
// appearing inside comments, the doctype, or attribute values. Full structural
// parsing (and sanitizing) is the sanitizer's job, not this reader's.

const SVG_PROBE_BYTES = 64 * 1024;

/** Index just past the XML prolog (decl, PIs, comments, doctype, whitespace), or -1 if malformed. */
function skipProlog(text: string): number {
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  for (;;) {
    while (i < text.length && /\s/.test(text[i] ?? "")) i++;
    if (text.startsWith("<?", i)) {
      const end = text.indexOf("?>", i + 2);
      if (end === -1) return -1;
      i = end + 2;
    } else if (text.startsWith("<!--", i)) {
      const end = text.indexOf("-->", i + 4);
      if (end === -1) return -1;
      i = end + 3;
    } else if (text.slice(i, i + 9).toUpperCase() === "<!DOCTYPE") {
      // Doctype may carry an internal subset in [...] containing '>'.
      let j = i + 9;
      let inSubset = false;
      let quote: string | null = null;
      for (; j < text.length; j++) {
        const c = text[j];
        if (quote) {
          if (c === quote) quote = null;
        } else if (c === '"' || c === "'") quote = c;
        else if (c === "[") inSubset = true;
        else if (c === "]") inSubset = false;
        else if (c === ">" && !inSubset) break;
      }
      if (j >= text.length) return -1;
      i = j + 1;
    } else {
      return i;
    }
  }
}

/** The root element's start tag text if it is `<svg ...>`, else null. */
function svgRootTag(text: string): string | null {
  const start = skipProlog(text);
  if (start === -1 || !/^<svg[\s/>]/.test(text.slice(start, start + 5))) return null;
  let quote: string | null = null;
  for (let j = start + 4; j < text.length; j++) {
    const c = text[j];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === ">") return text.slice(start, j + 1);
  }
  return null;
}

function rootAttributes(tag: string): Map<string, string> {
  const attrs = new Map<string, string>();
  const re = /([^\s=/>"']+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (const m of tag.slice(4).matchAll(re)) {
    const name = (m[1] ?? "").toLowerCase();
    if (!attrs.has(name)) attrs.set(name, m[2] ?? m[3] ?? "");
  }
  return attrs;
}

const UNSIGNED = String.raw`(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?`;
const ABSOLUTE_LENGTH = new RegExp(`^(\\+?${UNSIGNED})(?:px)?$`);
const VIEWBOX_NUMBER = new RegExp(`^[+-]?${UNSIGNED}$`);

/** A positive unitless or `px` length, else null (`%`, `em`, etc. are not absolute). */
function absoluteLength(value: string | undefined): number | null {
  if (value === undefined) return null;
  const m = ABSOLUTE_LENGTH.exec(value.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function viewBoxSize(value: string | undefined): { width: number; height: number } | null {
  if (value === undefined) return null;
  const parts = value.trim().split(/[\s,]+/);
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => (VIEWBOX_NUMBER.test(p) ? Number(p) : NaN));
  const [, , w = NaN, h = NaN] = nums;
  if (nums.some((n) => !Number.isFinite(n)) || w <= 0 || h <= 0) return null;
  return { width: w, height: h };
}

function toPixels(width: number, height: number): { width: number; height: number } | null {
  const w = Math.max(1, Math.ceil(width));
  const h = Math.max(1, Math.ceil(height));
  return validDims(w, h) ? { width: w, height: h } : null;
}

/**
 * Intrinsic size of an SVG document: absolute (unitless or `px`) `width` and
 * `height` on the root `<svg>` take precedence; otherwise the `viewBox`
 * width/height. When only one of width/height is absolute, the other is
 * derived from the viewBox aspect ratio. Returns null when the root is not
 * `<svg>` or the size cannot be determined. Values are ceiled to integers.
 */
export function readSvgDimensions(svgText: string): { width: number; height: number } | null {
  const tag = svgRootTag(svgText);
  if (!tag) return null;
  const attrs = rootAttributes(tag);
  const width = absoluteLength(attrs.get("width"));
  const height = absoluteLength(attrs.get("height"));
  if (width !== null && height !== null) return toPixels(width, height);

  const vb = viewBoxSize(attrs.get("viewbox"));
  if (!vb) return null;
  if (width !== null) return toPixels(width, (width * vb.height) / vb.width);
  if (height !== null) return toPixels((height * vb.width) / vb.height, height);
  return toPixels(vb.width, vb.height);
}

function readSvg(bytes: Uint8Array): ImageInfo | null {
  let text: string;
  try {
    // Fatal decoding rejects binary data that is not valid UTF-8.
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
  const dims = readSvgDimensions(text);
  return dims ? { format: "svg", ...dims } : null;
}

function looksLikeText(bytes: Uint8Array): boolean {
  // Cheap pre-check before a full decode: first non-BOM, non-space byte is '<'.
  let i = startsWith(bytes, [0xef, 0xbb, 0xbf]) ? 3 : 0;
  const limit = Math.min(bytes.length, SVG_PROBE_BYTES);
  while (i < limit && [0x20, 0x09, 0x0a, 0x0d].includes(bytes[i] ?? 0)) i++;
  return bytes[i] === 0x3c;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Detect an image's format from its bytes and read its intrinsic size.
 * Returns null for unrecognized, malformed, truncated, or unsizeable input.
 */
export function readImageInfo(bytes: Uint8Array): ImageInfo | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (startsWith(bytes, PNG_SIG)) return readPng(bytes, view);
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return readJpeg(bytes, view);
  if (startsWith(bytes, ascii("GIF87a")) || startsWith(bytes, ascii("GIF89a"))) {
    return readGif(bytes, view);
  }
  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) {
    return readWebp(bytes, view);
  }
  if (looksLikeText(bytes)) return readSvg(bytes);
  return null;
}

/** Stored asset extension for a format (`jpeg` is stored as `.jpg`). */
export function extForFormat(format: ImageFormat): AssetExt {
  return format === "jpeg" ? "jpg" : format;
}

const CONTENT_TYPES: Record<ImageFormat, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

/** MIME type to store and serve an asset of this format with. */
export function contentTypeForFormat(format: ImageFormat): string {
  return CONTENT_TYPES[format];
}
