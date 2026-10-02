import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { JSDOM, VirtualConsole } from "jsdom";

import { ArticleParagraphSchema } from "../../../types/article";
import { selectContentRoot } from "../content-root";
import { extractBlocks, type BlockOutput, type ExtractedBlock } from "../blocks";
import { textOf } from "../exclusions";

const FIXTURES = path.resolve(__dirname, "../../__tests__/fixtures/html");

function parse(html: string): Document {
  return new JSDOM(html, { virtualConsole: new VirtualConsole() }).window.document;
}

function fixture(name: string): Document {
  return parse(readFileSync(path.join(FIXTURES, name), "utf8"));
}

function body(html: string): HTMLElement {
  return parse(`<!DOCTYPE html><html><body>${html}</body></html>`).body;
}

const blocks = (outputs: BlockOutput[]): ExtractedBlock[] =>
  outputs.filter((o): o is ExtractedBlock => o.kind !== "pending-figure");

/** Plain `{ text }` blocks (no kind) — the catch-all's (and paragraphs') output. */
const plainTexts = (outputs: BlockOutput[]): string[] =>
  blocks(outputs)
    .filter((b) => b.kind === undefined)
    .map((b) => b.text);

const allText = (outputs: BlockOutput[]): string => blocks(outputs).map((b) => b.text).join("\n");

describe("catch-all — reference fixture", () => {
  const doc = fixture("reference-ai-native-sdlc.html");
  const root = selectContentRoot(doc);
  const outputs = extractBlocks(root);
  const texts = plainTexts(outputs);

  it("emits each of the 2 .sd-key callouts as one text block", () => {
    const keys = Array.from(root.querySelectorAll(".sd-key"));
    expect(keys).toHaveLength(2);
    for (const key of keys) {
      const expected = textOf(key);
      expect(expected.length).toBeGreaterThan(20);
      expect(texts.filter((t) => t === expected)).toHaveLength(1);
    }
  });

  it("emits the 44×44 callout icons as nothing (no figure, no text)", () => {
    const icons = Array.from(root.querySelectorAll(".sd-key svg"));
    expect(icons).toHaveLength(2);
    const svgFigures = outputs.filter((o) => o.kind === "pending-figure" && o.source.type === "inline-svg");
    expect(svgFigures).toHaveLength(0);
  });

  it("emits the text of the other sd-* embed boxes as text blocks", () => {
    const expected = [
      // sd-pdf: label, bold lead + trailing text in one run, inline link
      "Prefer a PDF?",
      "This playbook is also available for download — the same six stages, plays, and worked examples, laid out for reading offline or sharing with your team.",
      "Download the PDF ↓",
      // sd-toc label
      "Table of contents",
      // sd-band: stage number, then (heading Plan), then the stage summary
      "01",
      "Ideas stop waiting for someone to write them up. Intent is captured once, in the originator's own words, as a version-controlled artifact the next stage can act on.",
      // sd-k / sd-kv
      "Getting started",
      "Prerequisites",
      "None.",
      "How to measure it",
      // sd-side
      "Sidebar",
      "Applies to every artifact the process produces.",
    ];
    for (const t of expected) expect(texts).toContain(t);
  });

  it("separates a leading CSS-block label from the text after it in an sd-vs run", () => {
    // `<small>AI-native</small>The originator…` — <small> is display:block only
    // via CSS. The leading-label rule (exclusions.joinParts) inserts a space.
    expect(texts).toContain(
      "AI-native The originator brainstorms with Claude and writes the result down as intent.md, a proto-spec in the originator's own terms. The artifact contains what is wanted, why, and under which constraints. Repeat processes are encoded via skills."
    );
    expect(texts.some((t) => t.startsWith("Traditional An idea passes through backlog entries"))).toBe(true);
    expect(texts.some((t) => t.includes("TraditionalAn"))).toBe(false);
  });

  it("puts sd-band parts in document order around the heading", () => {
    const plain = blocks(outputs);
    const i = plain.findIndex((b) => b.kind === "heading" && b.text === "Plan");
    expect(i).toBeGreaterThan(0);
    expect(plain[i - 1]!.text).toBe("01");
    expect(plain[i + 1]!.text.startsWith("Ideas stop waiting")).toBe(true);
  });

  it("produces schema-valid blocks", () => {
    for (const b of blocks(outputs)) expect(ArticleParagraphSchema.safeParse({ index: 0, ...b }).success).toBe(true);
  });
});

describe("catch-all — callouts-hidden.html", () => {
  const doc = fixture("callouts-hidden.html");
  const outputs = extractBlocks(doc.body);
  const texts = plainTexts(outputs);
  const everything = allText(outputs);

  it("emits each callout as one text block; icons produce nothing", () => {
    expect(texts).toContain("Every callout with an icon and bare text should become one text block.");
    expect(texts).toContain("Second callout with mixed inline and bare text.");
    expect(texts).toContain("A callout with bare text only and no icon.");
    expect(outputs.some((o) => o.kind === "pending-figure")).toBe(false);
  });

  it("never emits hidden, nav, footer, button, style, noscript, or footnote text", () => {
    for (const banned of [
      "Navigation text",
      "Home",
      "Hidden via",
      "Hidden paragraph",
      "Copy link",
      "Enable JavaScript",
      "inline-style",
      "callout {",
      "Footnote text",
      "Footer text",
    ]) {
      expect(everything).not.toContain(banned);
    }
  });

  it("emits <dt> and <dd> as separate blocks, in order", () => {
    const i = texts.indexOf("Term one");
    expect(texts.slice(i, i + 4)).toEqual([
      "Term one",
      "Definition of term one.",
      "Term two",
      "Definition of term two.",
    ]);
  });

  it("emits the full expected block sequence", () => {
    expect(blocks(outputs).map((b) => b.text)).toEqual([
      "Callouts fixture: bare-text containers become text blocks; hidden and chrome content is dropped.",
      "Every callout with an icon and bare text should become one text block.",
      "Second callout with mixed inline and bare text.",
      "A callout with bare text only and no icon.",
      "Term one",
      "Definition of term one.",
      "Term two",
      "Definition of term two.",
      "Body text with a footnote marker1.",
      "Closing paragraph after the callouts.",
    ]);
  });
});

describe("catch-all — run grouping", () => {
  const run = (html: string) => blocks(extractBlocks(body(html))).map((b) => b.text);

  it("keeps inline formatting inside a bare div as one block", () => {
    expect(run(`<div>Plain <strong>bold</strong>, <a href="/x">a <em>link</em></a> and <span>span</span> end.</div>`)).toEqual([
      "Plain bold, a link and span end.",
    ]);
  });

  it("turns <br> inside a run into a space", () => {
    expect(run(`<div>line one<br>line two<br/><b>three</b></div>`)).toEqual(["line one line two three"]);
  });

  it("starts a run inside an inline wrapper and continues past it", () => {
    expect(run(`<div><span>Start</span> middle <em>end</em></div>`)).toEqual(["Start middle end"]);
  });

  it("ends a run at a block-level element and starts a new one after it", () => {
    expect(run(`<div>before <div>inner</div> after</div>`)).toEqual(["before", "inner", "after"]);
    expect(run(`<div>before <p>para</p> after</div>`)).toEqual(["before", "para", "after"]);
    expect(run(`<section>a<ul><li>item</li></ul>b</section>`)).toEqual(["a", "- item", "b"]);
  });

  it("skips excluded inline elements without ending the run", () => {
    expect(run(`<div>Share <button>Copy</button> this <span hidden>secret</span>page<svg aria-hidden="true"><text>x</text></svg> now</div>`)).toEqual([
      "Share this page now",
    ]);
  });

  it("ends a run at an image so the figure stays between the texts", () => {
    const out = extractBlocks(body(`<div>Before <img src="https://example.com/a.png" alt="A"> after</div>`));
    expect(out.map((o) => (o.kind === "pending-figure" ? "[figure]" : o.text))).toEqual(["Before", "[figure]", "after"]);
  });

  it("emits bare text directly in the root", () => {
    expect(run(`loose text <b>here</b><p>para</p>tail`)).toEqual(["loose text here", "para", "tail"]);
  });

  it("collapses whitespace including NBSP", () => {
    expect(run(`<div>\n  a\u00a0\u00a0 b \t\n c  </div>`)).toEqual(["a b c"]);
  });

  it("emits nothing for whitespace-only or excluded-only containers", () => {
    expect(run(`<div>  <span> </span> <button>x</button></div>`)).toEqual([]);
  });

  it("does not re-emit text inside handled elements", () => {
    expect(run(`<div>lead <table><tr><td>cell</td></tr></table> <pre>code</pre> trail</div>`)).toEqual([
      "lead",
      "cell",
      "code",
      "trail",
    ]);
  });

  it("emits <dt>/<dd> as separate blocks", () => {
    expect(run(`<dl><dt>T</dt><dd>D <i>more</i></dd></dl>`)).toEqual(["T", "D more"]);
  });
});
