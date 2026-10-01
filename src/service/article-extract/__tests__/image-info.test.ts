import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  readImageInfo,
  readSvgDimensions,
  extForFormat,
  contentTypeForFormat,
} from "../image-info";

const IMAGES = join(__dirname, "../../__tests__/fixtures/images");

function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(IMAGES, name)));
}

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

describe("readImageInfo — raster fixtures", () => {
  it.each([
    ["tiny.png", "png", 3, 2],
    ["tiny.jpg", "jpeg", 5, 4],
    ["tiny.gif", "gif", 7, 3],
    ["tiny.webp", "webp", 6, 5],
  ] as const)("%s → %s %d×%d", (file, format, width, height) => {
    expect(readImageInfo(fixture(file))).toEqual({ format, width, height });
  });

  it("works on a subarray view with a non-zero byteOffset", () => {
    const png = fixture("tiny.png");
    const padded = new Uint8Array(png.length + 7);
    padded.set(png, 7);
    expect(readImageInfo(padded.subarray(7))).toEqual({ format: "png", width: 3, height: 2 });
  });
});

describe("readImageInfo — rejection", () => {
  it("rejects a text file named .png", () => {
    expect(readImageInfo(fixture("fake.png"))).toBeNull();
  });

  it("rejects empty input", () => {
    expect(readImageInfo(new Uint8Array(0))).toBeNull();
  });

  it.each([
    ["tiny.png", 16],
    ["tiny.jpg", 12],
    ["tiny.gif", 8],
    ["tiny.webp", 16],
  ] as const)("rejects truncated %s (first %d bytes)", (file, keep) => {
    // Keep the magic bytes but cut the header short.
    expect(readImageInfo(fixture(file).subarray(0, keep))).toBeNull();
  });

  it("rejects a PNG truncated inside IHDR", () => {
    expect(readImageInfo(fixture("tiny.png").subarray(0, 20))).toBeNull();
  });

  it("rejects a PNG whose first chunk is not IHDR", () => {
    const bytes = fixture("tiny.png").slice();
    bytes[12] = 0x58; // "XHDR"
    expect(readImageInfo(bytes)).toBeNull();
  });

  it("rejects a JPEG with no SOF before SOS", () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xda, 0x00, 0x02]);
    expect(readImageInfo(bytes)).toBeNull();
  });

  it("rejects a JPEG whose segment length runs past the end", () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x7f, 0xff, 0x00]);
    expect(readImageInfo(bytes)).toBeNull();
  });

  it("rejects random binary that is not valid UTF-8", () => {
    expect(readImageInfo(new Uint8Array([0x3c, 0xff, 0xfe, 0x00, 0x80]))).toBeNull();
  });

  it("rejects an HTML document", () => {
    expect(readImageInfo(utf8("<!doctype html><html><body>hi</body></html>"))).toBeNull();
  });
});

describe("readImageInfo — synthetic rasters", () => {
  it("skips DHT/APP segments and fill bytes to reach a progressive SOF2", () => {
    const bytes = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, // APP0
      0xff, 0xc4, 0x00, 0x04, 0x00, 0x00, // DHT (must not be treated as SOF)
      0xff, 0xff, 0xc2, 0x00, 0x0b, 0x08, 0x01, 0x2c, 0x02, 0x58, 0x03, 0x01, 0x11, 0x00, // SOF2 300×600
    ]);
    expect(readImageInfo(bytes)).toEqual({ format: "jpeg", width: 600, height: 300 });
  });

  it("reads a lossy VP8 WebP", () => {
    const bytes = new Uint8Array(30);
    bytes.set(utf8("RIFF"), 0);
    bytes.set(utf8("WEBP"), 8);
    bytes.set(utf8("VP8 "), 12);
    bytes.set([0x9d, 0x01, 0x2a], 23);
    new DataView(bytes.buffer).setUint16(26, 640, true);
    new DataView(bytes.buffer).setUint16(28, 480, true);
    expect(readImageInfo(bytes)).toEqual({ format: "webp", width: 640, height: 480 });
  });

  it("reads an extended VP8X WebP", () => {
    const bytes = new Uint8Array(30);
    bytes.set(utf8("RIFF"), 0);
    bytes.set(utf8("WEBP"), 8);
    bytes.set(utf8("VP8X"), 12);
    // canvas width-1 = 1999 (0x07CF), height-1 = 99 (0x63), 24-bit LE
    bytes.set([0xcf, 0x07, 0x00], 24);
    bytes.set([0x63, 0x00, 0x00], 27);
    expect(readImageInfo(bytes)).toEqual({ format: "webp", width: 2000, height: 100 });
  });

  it("rejects a GIF with zero width", () => {
    const bytes = new Uint8Array(13);
    bytes.set(utf8("GIF89a"), 0);
    bytes[8] = 3;
    expect(readImageInfo(bytes)).toBeNull();
  });
});

describe("readImageInfo — SVG", () => {
  it("wide-viewbox.svg → 2400×600", () => {
    expect(readImageInfo(fixture("wide-viewbox.svg"))).toEqual({ format: "svg", width: 2400, height: 600 });
  });

  it("unsizeable.svg → null", () => {
    expect(readImageInfo(fixture("unsizeable.svg"))).toBeNull();
  });

  it("benign-diagram.svg uses width/height", () => {
    expect(readImageInfo(fixture("benign-diagram.svg"))).toEqual({ format: "svg", width: 640, height: 240 });
  });

  it("accepts a UTF-8 BOM and leading whitespace", () => {
    const bytes = utf8('﻿\n  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 20"/>');
    expect(readImageInfo(bytes)).toEqual({ format: "svg", width: 10, height: 20 });
  });
});

describe("readSvgDimensions", () => {
  it("reads px units", () => {
    expect(readSvgDimensions('<svg width="120px" height="80px"></svg>')).toEqual({ width: 120, height: 80 });
  });

  it("prefers width/height over viewBox", () => {
    expect(readSvgDimensions('<svg viewBox="0 0 2400 600" width="300" height="75"/>')).toEqual({
      width: 300,
      height: 75,
    });
  });

  it("parses a comma-separated viewBox", () => {
    expect(readSvgDimensions('<svg viewBox="0,0,320,180"/>')).toEqual({ width: 320, height: 180 });
    expect(readSvgDimensions('<svg viewBox="0, 0, 320, 180"/>')).toEqual({ width: 320, height: 180 });
  });

  it("skips an XML declaration, comments, and a doctype before the root", () => {
    const text = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      "<!-- <svg width='1' height='1'> in a comment -->",
      '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd" [ <!ENTITY a "b>"> ]>',
      "<!-- another -->",
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 25"><rect/></svg>',
    ].join("\n");
    expect(readSvgDimensions(text)).toEqual({ width: 50, height: 25 });
  });

  it("reads the reference callout icon pattern (viewBox 0 0 44 44, no width/height) as 44×44", () => {
    const icon =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 44" fill="none" aria-hidden="true"><circle cx="22" cy="22" r="20"/></svg>';
    expect(readSvgDimensions(icon)).toEqual({ width: 44, height: 44 });
  });

  it("returns null for %/em sizes without a viewBox", () => {
    expect(readSvgDimensions('<svg width="100%" height="5em"/>')).toBeNull();
  });

  it("falls back to viewBox when width/height are relative", () => {
    expect(readSvgDimensions('<svg width="100%" height="100%" viewBox="0 0 400 300"/>')).toEqual({
      width: 400,
      height: 300,
    });
  });

  it("derives the missing side from the viewBox aspect ratio", () => {
    expect(readSvgDimensions('<svg width="200" viewBox="0 0 400 100"/>')).toEqual({ width: 200, height: 50 });
  });

  it("ceils fractional sizes to integers", () => {
    expect(readSvgDimensions('<svg viewBox="0 0 10.2 0.3"/>')).toEqual({ width: 11, height: 1 });
    expect(readSvgDimensions('<svg width="12.5" height="7.01"/>')).toEqual({ width: 13, height: 8 });
  });

  it("rejects non-positive or malformed values", () => {
    expect(readSvgDimensions('<svg width="0" height="10"/>')).toBeNull();
    expect(readSvgDimensions('<svg width="-5" height="10"/>')).toBeNull();
    expect(readSvgDimensions('<svg viewBox="0 0 -10 10"/>')).toBeNull();
    expect(readSvgDimensions('<svg viewBox="0 0 10"/>')).toBeNull();
    expect(readSvgDimensions('<svg viewBox="a b c d"/>')).toBeNull();
  });

  it("is not fooled by quoted '>' or '<svg' in other places", () => {
    expect(readSvgDimensions('<svg data-x="a>b" width="9" height="4"/>')).toEqual({ width: 9, height: 4 });
    expect(readSvgDimensions('<html><svg width="9" height="4"/></html>')).toBeNull();
    expect(readSvgDimensions('<svgfoo width="9" height="4"/>')).toBeNull();
  });

  it("ignores namespaced lookalike attributes", () => {
    expect(readSvgDimensions('<svg foo:width="9" foo:height="4"/>')).toBeNull();
  });

  it("returns null for an unterminated prolog or root tag", () => {
    expect(readSvgDimensions('<!-- never closed <svg width="1" height="1"/>')).toBeNull();
    expect(readSvgDimensions('<svg width="1" height="1"')).toBeNull();
  });
});

describe("format helpers", () => {
  it("maps formats to asset extensions", () => {
    expect(extForFormat("jpeg")).toBe("jpg");
    expect(extForFormat("png")).toBe("png");
    expect(extForFormat("gif")).toBe("gif");
    expect(extForFormat("webp")).toBe("webp");
    expect(extForFormat("svg")).toBe("svg");
  });

  it("maps formats to content types", () => {
    expect(contentTypeForFormat("png")).toBe("image/png");
    expect(contentTypeForFormat("jpeg")).toBe("image/jpeg");
    expect(contentTypeForFormat("gif")).toBe("image/gif");
    expect(contentTypeForFormat("webp")).toBe("image/webp");
    expect(contentTypeForFormat("svg")).toBe("image/svg+xml");
  });
});
