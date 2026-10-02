import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { extractBlocks } from "../blocks";
import { textOf } from "../exclusions";

function body(html: string): Element {
  return new JSDOM(`<!doctype html><body>${html}</body>`).window.document.body;
}

function texts(html: string): string[] {
  return extractBlocks(body(html)).map((b) => ("text" in b ? b.text : ""));
}

describe("leading-label separator", () => {
  it("adds a space after a leading <small>/<b>/<strong> label before an uppercase word", () => {
    expect(texts("<div><small>Traditional</small>An idea passes.</div>")).toEqual(["Traditional An idea passes."]);
    expect(texts("<div><b>Note</b>Read this.</div>")).toEqual(["Note Read this."]);
    expect(texts("<p><strong>Step</strong>2 follows.</p>")).toEqual(["Step 2 follows."]);
  });

  it("applies inside textOf-based handlers (paragraphs)", () => {
    const p = body("<p><small>Label</small>Body text.</p>").querySelector("p")!;
    expect(textOf(p)).toBe("Label Body text.");
  });

  it("leaves a lowercase continuation joined", () => {
    expect(texts("<div><b>Un</b>believable.</div>")).toEqual(["Unbelievable."]);
  });

  it("leaves mid-run inline elements joined (footnote markers, emphasis)", () => {
    expect(texts("<div>A marker<sup>1</sup>. Then <b>bold</b>Word.</div>")).toEqual(["A marker1. Then boldWord."]);
  });

  it("does not double an existing space", () => {
    expect(texts("<div><small>Label</small> Already spaced.</div>")).toEqual(["Label Already spaced."]);
  });

  it("does not apply to other inline tags", () => {
    expect(texts("<div><span>Label</span>Next.</div>")).toEqual(["LabelNext."]);
  });

  it("ignores an excluded label", () => {
    expect(texts('<div><small hidden>Hidden</small>Visible text.</div>')).toEqual(["Visible text."]);
  });
});
