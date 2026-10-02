import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { JSDOM, VirtualConsole } from "jsdom";

import { selectContentRoot } from "../content-root";
import { extractBlocks, type BlockOutput, type ExtractedBlock, type PendingFigure } from "../blocks";
import {
  chooseImageUrl,
  figureAssetSha,
  figureHandler,
  resolveFigures,
  MAX_FIGURES,
  FIGURE_CONCURRENCY,
} from "../figure";
import type { FetchImageResult, fetchImage as realFetchImage } from "../image-fetch";
import { MAX_RASTER_BYTES, MAX_SVG_BYTES } from "../image-fetch";
import { readSvgDimensions } from "../image-info";
import { sha256Hex } from "../../../repository/asset";
import { ArticleParagraphSchema, assetKey, type AssetExt } from "../../../types/article";

const FIXTURES = path.resolve(__dirname, "../../__tests__/fixtures");
const html = (name: string): string => readFileSync(path.join(FIXTURES, "html", name), "utf8");
const image = (name: string): Uint8Array => new Uint8Array(readFileSync(path.join(FIXTURES, "images", name)));

function parse(src: string): Document {
  return new JSDOM(src, { virtualConsole: new VirtualConsole() }).window.document;
}

function body(inner: string): Element {
  return parse(`<!DOCTYPE html><html><body>${inner}</body></html>`).body;
}

const pendings = (outputs: BlockOutput[]): PendingFigure[] =>
  outputs.filter((o): o is PendingFigure => o.kind === "pending-figure");

// ── DI doubles ────────────────────────────────────────────────────────────────

type FetchFn = typeof realFetchImage;
type PutFn = (bytes: Uint8Array, ext: AssetExt, contentType: string) => Promise<string>;

/** fetchImage double serving `routes` (URL → bytes); unknown URLs are HTTP errors. */
function fakeFetch(routes: Record<string, Uint8Array>, delayMs = 0) {
  let active = 0;
  let maxActive = 0;
  const fn = vi.fn<FetchFn>(async (url) => {
    active++;
    maxActive = Math.max(maxActive, active);
    try {
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      const bytes = routes[url];
      const result: FetchImageResult = bytes
        ? { ok: true, bytes, finalUrl: url, contentType: null }
        : { ok: false, reason: "HTTP_ERROR" };
      return result;
    } finally {
      active--;
    }
  });
  return { fn, maxActive: () => maxActive };
}

function fakePut() {
  const stored = new Map<string, { bytes: Uint8Array; contentType: string }>();
  const fn = vi.fn<PutFn>(async (bytes, ext, contentType) => {
    const key = assetKey(sha256Hex(bytes), ext);
    stored.set(key, { bytes, contentType });
    return key;
  });
  return { fn, stored };
}

function imgFigure(src: string, caption = "", alt = ""): PendingFigure {
  return { kind: "pending-figure", source: { type: "img", src }, alt, caption };
}

function svgFigure(svg: string, caption = "", alt = ""): PendingFigure {
  return { kind: "pending-figure", source: { type: "inline-svg", svg }, alt, caption };
}

const BASE = "https://example.com/blog/post";

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  warn.mockRestore();
});

// ── Detection ─────────────────────────────────────────────────────────────────

describe("figureHandler — reference fixture", () => {
  const outputs = extractBlocks(selectContentRoot(parse(html("reference-ai-native-sdlc.html"))));
  const figs = pendings(outputs);

  it("yields exactly 4 pending figures, in order, from the 4 <figure>s", () => {
    expect(figs).toHaveLength(4);
    for (const f of figs) {
      expect(f.source).toMatchObject({
        type: "img",
        src: expect.stringMatching(/^https:\/\/cdn\.prod\.website-files\.com\/.+\.png$/),
      });
      expect(f.alt).toBe("");
    }
  });

  it("takes 3 captions from <figcaption> and leaves the 4th empty", () => {
    expect(figs[0]!.caption).toMatch(/^Build is no longer the constraint — the human-speed steps around it are\./);
    expect(figs[1]!.caption).toBe("");
    expect(figs[2]!.caption).toMatch(/^The plays are listed with stage; the arrows give the order to adopt them in\./);
    expect(figs[3]!.caption).toBe(
      "The channel is the audit trail: request, diagnosis, human authorization and fix all stay where the incident was handled."
    );
  });

  it("does not re-emit figcaption text as a separate block", () => {
    const texts = outputs.filter((o): o is ExtractedBlock => o.kind !== "pending-figure").map((b) => b.text);
    expect(texts.some((t) => t.startsWith("Build is no longer the constraint"))).toBe(false);
  });

  it("emits nothing for the .sd-key 44×44 callout icons", () => {
    const root = selectContentRoot(parse(html("reference-ai-native-sdlc.html")));
    const icons = Array.from(root.querySelectorAll(".sd-key svg"));
    expect(icons).toHaveLength(2);
    for (const icon of icons) {
      expect(readSvgDimensions(icon.outerHTML)).toEqual({ width: 44, height: 44 });
      // Even without aria-hidden (walker exclusion), the ≤ 64 px rule drops it.
      icon.removeAttribute("aria-hidden");
      const wrapper = icon.ownerDocument.createElement("div");
      wrapper.appendChild(icon.cloneNode(true));
      expect(extractBlocks(wrapper)).toEqual([]);
    }
  });
});

describe("figureHandler — standalone elements", () => {
  it("standalone <img> → pending figure with alt and empty caption", () => {
    const out = extractBlocks(body('<p>Intro</p><img src="/a.png" alt=" A chart "><p>After</p>'));
    expect(out).toEqual([
      { text: "Intro" },
      { kind: "pending-figure", source: { type: "img", src: "/a.png" }, alt: "A chart", caption: "" },
      { text: "After" },
    ]);
  });

  it("uses data-src when src is missing or a data: placeholder; keeps srcset", () => {
    const out = pendings(
      extractBlocks(
        body(
          '<img data-src="/lazy.png">' +
            '<img src="data:image/gif;base64,R0lGOD" data-src="/lazy2.png">' +
            '<img src="/s.png" srcset="/s-640.png 640w, /s-1280.png 1280w">'
        )
      )
    );
    expect(out.map((f) => f.source)).toEqual([
      { type: "img", src: "/lazy.png" },
      { type: "img", src: "/lazy2.png" },
      { type: "img", src: "/s.png", srcset: "/s-640.png 640w, /s-1280.png 1280w" },
    ]);
  });

  it("drops an <img> with no source at all", () => {
    expect(extractBlocks(body('<img alt="nothing">'))).toEqual([]);
  });

  it("<picture> is treated like its <img>", () => {
    const out = extractBlocks(
      body('<picture><source srcset="/p.webp" type="image/webp"><img src="/p.jpg" alt="Pic"></picture>')
    );
    expect(out).toEqual([{ kind: "pending-figure", source: { type: "img", src: "/p.jpg" }, alt: "Pic", caption: "" }]);
  });

  it("<figure><picture> uses the picture's img and the figcaption", () => {
    const out = extractBlocks(
      body('<figure><picture><img src="/p.jpg" alt="Pic"></picture><figcaption> The <em>cap</em> </figcaption></figure>')
    );
    expect(out).toEqual([{ kind: "pending-figure", source: { type: "img", src: "/p.jpg" }, alt: "Pic", caption: "The cap" }]);
  });

  it("inline <svg> → pending figure; caption/alt from <title> or aria-label", () => {
    const svg = '<svg viewBox="0 0 200 100"><title>Flow</title><rect width="10" height="10"/></svg>';
    const out = pendings(extractBlocks(body(svg + '<svg viewBox="0 0 200 100" aria-label="Label"><rect width="1" height="1"/></svg>')));
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ alt: "Flow", caption: "Flow", source: { type: "inline-svg" } });
    expect(out[1]).toMatchObject({ alt: "Label", caption: "Label" });
    expect(out[0]!.source.type === "inline-svg" && out[0]!.source.svg).toContain("<title>Flow</title>");
  });

  it("<figure> with inline svg: figcaption wins over <title>", () => {
    const out = pendings(
      extractBlocks(body('<figure><svg viewBox="0 0 200 100"><title>T</title><rect/></svg><figcaption>Cap</figcaption></figure>'))
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ caption: "Cap", alt: "T", source: { type: "inline-svg" } });
  });

  it("decorative inline svg: inside <a>/<button>, role presentation/none, aria-hidden, or ≤ 64 px", () => {
    const big = '<rect width="1" height="1"/>';
    const cases = [
      `<a href="/x"><span><svg viewBox="0 0 500 500">${big}</svg></span>Link</a>`,
      `<svg role="presentation" viewBox="0 0 500 500">${big}</svg>`,
      `<svg role="none" viewBox="0 0 500 500">${big}</svg>`,
      `<svg aria-hidden="true" viewBox="0 0 500 500">${big}</svg>`,
      `<svg width="64" height="64">${big}</svg>`,
      `<svg viewBox="0 0 24 24"><text>icon</text></svg>`,
    ];
    for (const c of cases) expect({ c, figures: pendings(extractBlocks(body(c))) }).toEqual({ c, figures: [] });
    // One side > 64 is not decorative.
    expect(pendings(extractBlocks(body(`<svg width="65" height="10">${big}</svg>`)))).toHaveLength(1);
    // Unsizeable inline svg is still a figure (it resolves to unavailable).
    expect(pendings(extractBlocks(body(`<svg width="100%">${big}</svg>`)))).toHaveLength(1);
  });

  it("a <figure> without media is not matched, so its content is walked normally", () => {
    const out = extractBlocks(body("<figure><blockquote><p>Quoted</p></blockquote><figcaption>Who</figcaption></figure>"));
    expect(out).toContainEqual({ text: "Quoted" });
    expect(pendings(out)).toEqual([]);
  });

  it("a <figure> with media keeps text outside its caption as a text block", () => {
    const out = extractBlocks(body('<figure><img src="/a.png"><p>Extra note</p><figcaption>Cap</figcaption></figure>'));
    expect(out).toEqual([
      { kind: "pending-figure", source: { type: "img", src: "/a.png" }, alt: "", caption: "Cap" },
      { text: "Extra note" },
    ]);
  });

  it("matches() is false for unrelated elements", () => {
    const ctx = {} as never;
    expect(figureHandler.matches(body("<div></div>").firstElementChild!, ctx)).toBe(false);
    expect(figureHandler.matches(body("<figure><p>x</p></figure>").firstElementChild!, ctx)).toBe(false);
  });
});

describe("chooseImageUrl", () => {
  it("picks the largest w candidate, else the largest x, else src", () => {
    expect(chooseImageUrl({ src: "/s.png", srcset: "/a.png 640w, /b.png 1920w, /c.png 1280w" })).toBe("/b.png");
    expect(chooseImageUrl({ src: "/s.png", srcset: "/a.png 1x, /b.png 2x" })).toBe("/b.png");
    expect(chooseImageUrl({ src: "/s.png", srcset: "/only.png" })).toBe("/only.png");
    expect(chooseImageUrl({ src: "/s.png", srcset: "/a.png bogus" })).toBe("/s.png");
    expect(chooseImageUrl({ src: "/s.png" })).toBe("/s.png");
  });
});

// ── Resolution ────────────────────────────────────────────────────────────────

describe("resolveFigures — happy paths", () => {
  it("stores rasters with dims from the header and passes other blocks through", async () => {
    const fetch = fakeFetch({
      "https://example.com/i/tiny.png": image("tiny.png"),
      "https://cdn.example.com/tiny.jpg": image("tiny.jpg"),
      "https://example.com/blog/tiny.gif": image("tiny.gif"),
      "https://example.com/tiny.webp": image("tiny.webp"),
    });
    const put = fakePut();
    const blocks = await resolveFigures(
      [
        { text: "Before" },
        imgFigure("/i/tiny.png", "PNG caption"),
        imgFigure("https://cdn.example.com/tiny.jpg", "", "JPEG alt"),
        imgFigure("tiny.gif"),
        imgFigure("/tiny.webp"),
        { text: "After" },
      ],
      { baseUrl: BASE, fetchImage: fetch.fn, putAsset: put.fn }
    );

    expect(blocks.map((b) => b.text)).toEqual(["Before", "PNG caption", "JPEG alt", "Figure", "Figure", "After"]);
    const dims = blocks.slice(1, 5).map((b) => [b.figure?.format, b.figure?.width, b.figure?.height]);
    expect(dims).toEqual([
      ["png", 3, 2],
      ["jpeg", 5, 4],
      ["gif", 7, 3],
      ["webp", 6, 5],
    ]);
    expect(blocks[2]!.figure!.assetKey).toBe(assetKey(sha256Hex(image("tiny.jpg")), "jpg"));
    expect(put.fn).toHaveBeenCalledWith(image("tiny.png"), "png", "image/png");
    expect(fetch.fn).toHaveBeenCalledWith("https://example.com/i/tiny.png", { maxBytes: MAX_RASTER_BYTES });

    blocks.forEach((b, index) => {
      expect(ArticleParagraphSchema.safeParse({ ...b, index }).success).toBe(true);
    });
  });

  it("inline SVG: sanitized, sized from the sanitized markup, stored as .svg", async () => {
    const put = fakePut();
    const fetch = fakeFetch({});
    const svg = readFileSync(path.join(FIXTURES, "images", "wide-viewbox.svg"), "utf8");
    const [block] = await resolveFigures([svgFigure(svg, "Wide")], { baseUrl: BASE, fetchImage: fetch.fn, putAsset: put.fn });

    expect(fetch.fn).not.toHaveBeenCalled();
    expect(block!.figure).toMatchObject({ format: "svg", width: 2400, height: 600, caption: "Wide" });
    const stored = put.stored.get(block!.figure!.assetKey!)!;
    expect(stored.contentType).toBe("image/svg+xml");
    const text = new TextDecoder().decode(stored.bytes);
    expect(text).toMatch(/width="2400"/);
    expect(text).toMatch(/height="600"/);
    expect(readSvgDimensions(text)).toEqual({ width: 2400, height: 600 });
    expect(block!.figure!.assetKey).toBe(assetKey(sha256Hex(stored.bytes), "svg"));
  });

  it("fetched SVG: uses the SVG byte cap and stores sanitized bytes", async () => {
    const url = "https://example.com/d/malicious.svg";
    const fetch = fakeFetch({ [url]: image("malicious.svg") });
    const put = fakePut();
    const [block] = await resolveFigures([imgFigure("/d/malicious.svg")], { baseUrl: BASE, fetchImage: fetch.fn, putAsset: put.fn });

    expect(fetch.fn).toHaveBeenCalledWith(url, { maxBytes: MAX_SVG_BYTES });
    expect(block!.figure!.format).toBe("svg");
    const text = new TextDecoder().decode(put.stored.get(block!.figure!.assetKey!)!.bytes);
    expect(text).not.toMatch(/<script|onload|foreignObject|evil\.example/i);
    expect(text).toContain('id="benign"');
  });

  it("resolves srcset to its largest candidate", async () => {
    const fetch = fakeFetch({ "https://example.com/big.png": image("tiny.png") });
    const put = fakePut();
    const pending: PendingFigure = {
      kind: "pending-figure",
      source: { type: "img", src: "/small.png", srcset: "/small.png 300w, /big.png 900w" },
      alt: "",
      caption: "",
    };
    const [block] = await resolveFigures([pending], { baseUrl: BASE, fetchImage: fetch.fn, putAsset: put.fn });
    expect(fetch.fn).toHaveBeenCalledTimes(1);
    expect(fetch.fn.mock.calls[0]![0]).toBe("https://example.com/big.png");
    expect(block!.figure!.unavailable).toBeUndefined();
  });
});

describe("resolveFigures — failures become unavailable", () => {
  async function resolveOne(pending: PendingFigure, routes: Record<string, Uint8Array> = {}, put = fakePut().fn) {
    const [block] = await resolveFigures([pending], { baseUrl: BASE, fetchImage: fakeFetch(routes).fn, putAsset: put });
    return block!;
  }

  const UNAVAILABLE = { assetKey: null, format: null, width: null, height: null, unavailable: true };

  it("fetch failure keeps the caption and logs host + reason only", async () => {
    const block = await resolveOne(imgFigure("/missing.png?token=secret", "Kept caption", "Alt"));
    expect(block).toEqual({ kind: "figure", text: "Kept caption", figure: { ...UNAVAILABLE, alt: "Alt", caption: "Kept caption" } });
    expect(ArticleParagraphSchema.safeParse({ ...block, index: 0 }).success).toBe(true);
    const logged = warn.mock.calls.map((c) => String(c[0])).join("\n");
    expect(JSON.parse(warn.mock.calls.at(-1)![0] as string)).toEqual({
      level: "warn",
      message: "figure unavailable",
      reason: "HTTP_ERROR",
      host: "example.com",
    });
    expect(logged).not.toContain("secret");
  });

  it("unsizeable.svg (fetched or inline) is unavailable", async () => {
    const svg = image("unsizeable.svg");
    expect((await resolveOne(imgFigure("/u.svg", "U"), { "https://example.com/u.svg": svg })).figure).toMatchObject(UNAVAILABLE);
    expect((await resolveOne(svgFigure(new TextDecoder().decode(svg), "U"))).figure).toMatchObject({ ...UNAVAILABLE, caption: "U" });
  });

  it("an SVG the sanitizer rejects (external-use.svg) is unavailable", async () => {
    const block = await resolveOne(imgFigure("/e.svg", "Ext"), { "https://example.com/e.svg": image("external-use.svg") });
    expect(block.figure).toMatchObject({ ...UNAVAILABLE, caption: "Ext" });
    expect(block.text).toBe("Ext");
  });

  it("bytes that are not an image (fake.png) are unavailable", async () => {
    const block = await resolveOne(imgFigure("/fake.png"), { "https://example.com/fake.png": image("fake.png") });
    expect(block).toMatchObject({ text: "Figure", figure: UNAVAILABLE });
  });

  it("SVG bytes over the SVG cap fetched from a non-.svg URL are unavailable", async () => {
    const big = new TextEncoder().encode(
      `<svg width="10" height="10"><rect width="1" height="1"/><!--${"x".repeat(MAX_SVG_BYTES)}--></svg>`
    );
    const block = await resolveOne(imgFigure("/render?id=1"), { "https://example.com/render?id=1": big });
    expect(block.figure).toMatchObject(UNAVAILABLE);
  });

  it("putAsset throwing (e.g. S3 409 ConditionalRequestConflict) is unavailable", async () => {
    const put = vi.fn<PutFn>(async () => {
      throw Object.assign(new Error("ConditionalRequestConflict"), { $metadata: { httpStatusCode: 409 } });
    });
    const block = await resolveOne(imgFigure("/t.png", "C"), { "https://example.com/t.png": image("tiny.png") }, put);
    expect(block.figure).toMatchObject({ ...UNAVAILABLE, caption: "C" });
    expect(JSON.parse(warn.mock.calls.at(-1)![0] as string)).toMatchObject({ reason: "STORE_FAILED" });
  });

  it("a fetchImage that throws is unavailable rather than rejecting", async () => {
    const fetchImage = vi.fn<FetchFn>(async () => {
      throw new Error("boom");
    });
    const [block] = await resolveFigures([imgFigure("/x.png", "X")], { baseUrl: BASE, fetchImage, putAsset: fakePut().fn });
    expect(block!.figure).toMatchObject({ ...UNAVAILABLE, caption: "X" });
  });
});

describe("resolveFigures — caps, dedupe, concurrency, order", () => {
  it("21 figures → first 20 stored, the 21st unavailable without being fetched", async () => {
    const routes: Record<string, Uint8Array> = {};
    const figs: PendingFigure[] = [];
    for (let i = 0; i < MAX_FIGURES + 1; i++) {
      routes[`https://example.com/${i}.png`] = image("tiny.png");
      figs.push(imgFigure(`/${i}.png`, `Cap ${i}`));
    }
    const fetch = fakeFetch(routes);
    const blocks = await resolveFigures(figs, { baseUrl: BASE, fetchImage: fetch.fn, putAsset: fakePut().fn });
    expect(blocks.filter((b) => b.figure?.unavailable !== true)).toHaveLength(20);
    expect(blocks[20]).toMatchObject({ text: "Cap 20", figure: { unavailable: true, caption: "Cap 20" } });
    expect(fetch.fn).toHaveBeenCalledTimes(20);
    expect(fetch.fn.mock.calls.map((c) => c[0])).not.toContain("https://example.com/20.png");
  });

  it("the same URL twice → one fetch, one stored object, two blocks", async () => {
    const fetch = fakeFetch({ "https://example.com/same.png": image("tiny.png") });
    const put = fakePut();
    const blocks = await resolveFigures(
      [imgFigure("/same.png", "One"), { text: "between" }, imgFigure("https://example.com/same.png", "Two")],
      { baseUrl: BASE, fetchImage: fetch.fn, putAsset: put.fn }
    );
    expect(fetch.fn).toHaveBeenCalledTimes(1);
    expect(put.stored.size).toBe(1);
    expect(blocks.map((b) => b.text)).toEqual(["One", "between", "Two"]);
    expect(blocks[0]!.figure!.assetKey).toBe(blocks[2]!.figure!.assetKey);
  });

  it("never runs more than 4 fetches at once and preserves output order", async () => {
    const routes: Record<string, Uint8Array> = {};
    const outputs: BlockOutput[] = [];
    const rasters = ["tiny.png", "tiny.jpg", "tiny.gif", "tiny.webp"];
    for (let i = 0; i < 12; i++) {
      routes[`https://example.com/${i}`] = image(rasters[i % 4]!);
      outputs.push({ text: `t${i}` }, imgFigure(`/${i}`, `f${i}`));
    }
    const fetch = fakeFetch(routes, 5);
    const blocks = await resolveFigures(outputs, { baseUrl: BASE, fetchImage: fetch.fn, putAsset: fakePut().fn });
    expect(fetch.maxActive()).toBe(FIGURE_CONCURRENCY);
    expect(blocks.map((b) => b.text)).toEqual(outputs.map((o) => (o.kind === "pending-figure" ? o.caption : o.text)));
    expect(blocks.filter((_, i) => i % 2 === 1).map((b) => b.figure!.format)).toEqual(
      Array.from({ length: 12 }, (_, i) => ["png", "jpeg", "gif", "webp"][i % 4])
    );
  });

  it("timeBudgetMs: figures not resolved by the deadline become unavailable (DEADLINE)", async () => {
    const routes: Record<string, Uint8Array> = { "https://example.com/fast.png": image("tiny.png") };
    const never = new Promise<FetchImageResult>(() => undefined);
    const fetchImage = vi.fn<FetchFn>(async (url) =>
      routes[url] ? { ok: true, bytes: routes[url], finalUrl: url, contentType: null } : never
    );
    const figs = [imgFigure("/fast.png", "Fast")];
    for (let i = 0; i < 6; i++) figs.push(imgFigure(`/slow${i}.png`, `Slow ${i}`));
    const started = Date.now();
    const blocks = await resolveFigures(figs, { baseUrl: BASE, fetchImage, putAsset: fakePut().fn, timeBudgetMs: 30 });
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(blocks[0]!.figure!.unavailable).toBeUndefined();
    expect(blocks.slice(1).every((b) => b.figure!.unavailable === true)).toBe(true);
    // Slots freed after the deadline do not start new fetches.
    expect(fetchImage.mock.calls.length).toBeLessThanOrEqual(FIGURE_CONCURRENCY + 1);
    const reasons = warn.mock.calls.map((c) => JSON.parse(c[0] as string).reason);
    expect(reasons.filter((r) => r === "DEADLINE")).toHaveLength(6);
  });

  it("timeBudgetMs that is not reached changes nothing", async () => {
    const fetch = fakeFetch({ "https://example.com/a.png": image("tiny.png") });
    const blocks = await resolveFigures([imgFigure("/a.png", "A")], {
      baseUrl: BASE,
      fetchImage: fetch.fn,
      putAsset: fakePut().fn,
      timeBudgetMs: 5_000,
    });
    expect(blocks[0]!.figure).toMatchObject({ format: "png", width: 3, height: 2 });
  });

  it("end to end: reference fixture → 4 figure blocks, 3 captions + 'Figure'", async () => {
    const outputs = extractBlocks(selectContentRoot(parse(html("reference-ai-native-sdlc.html"))));
    const urls = pendings(outputs).map((f) => (f.source.type === "img" ? f.source.src : ""));
    const fetch = fakeFetch(Object.fromEntries(urls.map((u) => [u, image("tiny.png")])));
    const put = fakePut();
    const blocks = await resolveFigures(outputs, { baseUrl: "https://claude.com/blog/x", fetchImage: fetch.fn, putAsset: put.fn });
    const figures = blocks.filter((b) => b.kind === "figure");
    expect(figures).toHaveLength(4);
    expect(figures[1]!.text).toBe("Figure");
    expect(figures.filter((b) => b.text !== "Figure")).toHaveLength(3);
    expect(put.stored.size).toBe(1); // same bytes everywhere → one object
    blocks.forEach((b, index) => {
      const parsed = ArticleParagraphSchema.safeParse({ ...b, index });
      expect(parsed.error?.issues).toBeUndefined();
    });
  });
});

describe("figureAssetSha", () => {
  it("returns the key's sha for an available figure and null otherwise", () => {
    const sha = "a".repeat(64);
    expect(
      figureAssetSha({ assetKey: assetKey(sha, "png"), format: "png", width: 1, height: 1, alt: "", caption: "" })
    ).toBe(sha);
    expect(
      figureAssetSha({ assetKey: null, format: null, width: null, height: null, alt: "", caption: "", unavailable: true })
    ).toBeNull();
  });
});
