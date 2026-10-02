import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { JSDOM, VirtualConsole } from "jsdom";

import { selectContentRoot } from "../content-root";
import {
  extractBlocks,
  DEFAULT_HANDLERS,
  DEFAULT_ON_UNCOVERED_TEXT,
  paragraphHandler,
  headingHandler,
  type BlockHandler,
  type BlockOutput,
  type ExtractedBlock,
} from "../blocks";
import { isExcluded, isInsideExcluded, textOf } from "../exclusions";
import { uncoveredTextHandler } from "../catch-all";

const FIXTURES = path.resolve(__dirname, "../../__tests__/fixtures/html");

function parse(html: string): Document {
  return new JSDOM(html, { virtualConsole: new VirtualConsole() }).window.document;
}

function fixture(name: string): Document {
  return parse(readFileSync(path.join(FIXTURES, name), "utf8"));
}

function body(html: string): Element {
  return parse(`<!DOCTYPE html><html><body>${html}</body></html>`).body;
}

function blocks(outputs: BlockOutput[]): ExtractedBlock[] {
  return outputs.filter((o): o is ExtractedBlock => o.kind !== "pending-figure");
}

const texts = (outputs: BlockOutput[]) => blocks(outputs).map((b) => b.text);

describe("extractBlocks — headings", () => {
  it("reference fixture yields 10 / 21 / 38 headings at levels 2 / 3 / 4, in order", () => {
    const doc = fixture("reference-ai-native-sdlc.html");
    const root = selectContentRoot(doc);
    const headings = blocks(extractBlocks(root)).filter((b) => b.kind === "heading");

    const count = (level: number) => headings.filter((h) => h.heading?.level === level).length;
    expect(count(2)).toBe(10);
    expect(count(3)).toBe(21);
    expect(count(4)).toBe(38);
    expect(headings).toHaveLength(69);

    // Same order and text as the source headings.
    const source = [...root.querySelectorAll("h2, h3, h4")];
    expect(headings.map((h) => h.text)).toEqual(source.map((h) => textOf(h)));
    expect(headings.map((h) => h.heading?.level)).toEqual(source.map((h) => Number(h.tagName[1])));

    const h2s = headings.filter((h) => h.heading?.level === 2).map((h) => h.text);
    expect(h2s[0]).toBe("Code is no longer the bottleneck");
    expect(h2s[9]).toBe("Closing thoughts");
  });

  it("maps h1 to level 2 and keeps h5/h6", () => {
    const out = extractBlocks(body("<h1>Top</h1><h5>Five</h5><h6>Six</h6>"));
    expect(out).toEqual([
      { text: "Top", kind: "heading", heading: { level: 2 } },
      { text: "Five", kind: "heading", heading: { level: 5 } },
      { text: "Six", kind: "heading", heading: { level: 6 } },
    ]);
  });

  it("skips empty and whitespace-only headings", () => {
    const out = extractBlocks(body("<h2></h2><h3>   \n </h3><h4><span aria-hidden='true'>#</span></h4><h2>Real</h2>"));
    expect(out).toEqual([{ text: "Real", kind: "heading", heading: { level: 2 } }]);
  });

  it("interleaves headings and paragraphs in document order", () => {
    const out = extractBlocks(body("<h2>A</h2><div><p>one</p><h3>B</h3></div><p>two</p>"));
    expect(texts(out)).toEqual(["A", "one", "B", "two"]);
  });
});

describe("extractBlocks — paragraphs", () => {
  it("emits normalized text blocks and skips empty paragraphs", () => {
    const out = extractBlocks(body("<p>  a\n  <em>b</em>   c </p><p></p><p>  </p>"));
    expect(out).toEqual([{ text: "a b c" }]);
  });

  it("does not emit <p> inside an element matched by an earlier handler", () => {
    const boxHandler: BlockHandler = {
      matches: (el) => el.classList.contains("box"),
      extract: (el, ctx) => [{ text: `box:${ctx.textOf(el)}` }],
    };
    const root = body(
      `<p>before</p><div class="box"><p>inner one</p><ul><li><p>inner two</p></li></ul></div><p>after</p>`
    );
    const out = extractBlocks(root, [boxHandler, ...DEFAULT_HANDLERS]);
    expect(texts(out)).toEqual(["before", "box:inner oneinner two", "after"]);
  });

  it("drops a matched element entirely when its handler returns []", () => {
    const dropper: BlockHandler = { matches: (el) => el.tagName === "UL", extract: () => [] };
    const out = extractBlocks(body("<ul><li><p>gone</p></li></ul><p>kept</p>"), [dropper, paragraphHandler]);
    expect(texts(out)).toEqual(["kept"]);
  });

  it("tries handlers in registration order (first match wins)", () => {
    const first: BlockHandler = { matches: (el) => el.tagName === "P", extract: () => [{ text: "first" }] };
    const out = extractBlocks(body("<p>x</p>"), [first, paragraphHandler]);
    expect(texts(out)).toEqual(["first"]);
  });

  it("skips nodes a handler marked covered", () => {
    const consumer: BlockHandler = {
      matches: (el) => el.id === "a",
      extract: (el, ctx) => {
        const next = el.nextElementSibling;
        if (next) ctx.markCovered(next);
        return [{ text: "a+b" }];
      },
    };
    const out = extractBlocks(body('<p id="a">a</p><p id="b">b</p><p>c</p>'), [consumer, paragraphHandler]);
    expect(texts(out)).toEqual(["a+b", "c"]);
  });

  it("never offers the root itself to handlers", () => {
    const root = body("<p>inner</p>");
    const p = root.querySelector("p")!;
    // With catch-all off, nothing is emitted: the <p> root is not a paragraph block.
    expect(extractBlocks(p, DEFAULT_HANDLERS, { onUncoveredText: () => [] })).toEqual([]);
    // With the default catch-all, its text arrives as uncovered text instead.
    expect(extractBlocks(p)).toEqual([{ text: "inner" }]);
  });
});

describe("exclusions", () => {
  const BANNED = [
    "Navigation text",
    "Hidden via",
    "Hidden paragraph",
    "Copy link",
    "Enable JavaScript",
    "inline-style",
    "Footnote text",
    "Footer text",
    "border:",
  ];

  it("excluded elements contribute nothing (callouts-hidden fixture)", () => {
    const doc = fixture("callouts-hidden.html");
    const uncovered: string[] = [];
    const out = extractBlocks(doc.body, DEFAULT_HANDLERS, {
      onUncoveredText: (t) => {
        uncovered.push(t.data);
      },
    });

    expect(texts(out)).toEqual([
      "Callouts fixture: bare-text containers become text blocks; hidden and chrome content is dropped.",
      "Body text with a footnote marker1.",
      "Closing paragraph after the callouts.",
    ]);
    const all = [...texts(out), ...uncovered].join("\n");
    for (const banned of BANNED) expect(all).not.toContain(banned);
    // Callout and <dl> text reaches the uncovered-text callback.
    expect(all).toContain("Every callout with an icon");
    expect(all).toContain("Definition of term two.");
  });

  it("isExcluded covers every FR-14 rule", () => {
    const excluded = [
      "<script></script>",
      "<style></style>",
      "<noscript></noscript>",
      "<template></template>",
      "<button></button>",
      "<input>",
      "<select></select>",
      "<textarea></textarea>",
      "<label></label>",
      "<nav></nav>",
      "<footer></footer>",
      '<div role="doc-endnotes"></div>',
      '<div role="doc-footnote"></div>',
      '<div class="x footnotes"></div>',
      "<div hidden></div>",
      '<div aria-hidden="true"></div>',
      '<svg aria-hidden="true"></svg>',
      '<div style="display:none"></div>',
      '<div style="color: red; display: none !important"></div>',
      '<div style="visibility: hidden;"></div>',
    ];
    for (const html of excluded) {
      const el = body(html).firstElementChild!;
      expect({ html, excluded: isExcluded(el) }).toEqual({ html, excluded: true });
    }
    const included = [
      "<p></p>",
      "<div></div>",
      '<div aria-hidden="false"></div>',
      '<div style="display:block"></div>',
      '<div style="display:none-ish"></div>',
      '<div class="footnote-ref"></div>',
      "<svg></svg>",
    ];
    for (const html of included) {
      const el = body(html).firstElementChild!;
      expect({ html, excluded: isExcluded(el) }).toEqual({ html, excluded: false });
    }
  });

  it("isInsideExcluded walks ancestors up to the root", () => {
    const root = body('<div id="r"><nav><span id="in">x</span></nav><span id="out">y</span></div>');
    const r = root.querySelector("#r")!;
    expect(isInsideExcluded(root.querySelector("#in")!.firstChild!, r)).toBe(true);
    expect(isInsideExcluded(root.querySelector("#out")!.firstChild!, r)).toBe(false);

    // Stops at the root: an excluded element above the root is not consulted.
    const hiddenAbove = body('<div hidden><div id="r2"><span id="s">z</span></div></div>');
    const r2 = hiddenAbove.querySelector("#r2")!;
    expect(isInsideExcluded(hiddenAbove.querySelector("#s")!, r2)).toBe(false);
    expect(isInsideExcluded(hiddenAbove.querySelector("#s")!)).toBe(true);
  });
});

describe("textOf", () => {
  it("collapses whitespace and trims", () => {
    const el = body("<p>\n  Hello,\t\n  <b>wide</b>   world  </p>").firstElementChild!;
    expect(textOf(el)).toBe("Hello, wide world");
  });

  it("skips excluded descendants", () => {
    const el = body(
      '<div>Keep <svg aria-hidden="true"><text>icon</text></svg>this <button>Copy</button><span hidden>secret</span>text<script>x()</script></div>'
    ).firstElementChild!;
    expect(textOf(el)).toBe("Keep this text");
  });

  it("is exposed on the context passed to handlers", () => {
    const seen: string[] = [];
    const spy: BlockHandler = {
      matches: (el) => el.tagName === "DIV",
      extract: (el, ctx) => {
        seen.push(ctx.textOf(el));
        return [];
      },
    };
    extractBlocks(body("<div> a <style>.x{}</style> b </div>"), [spy]);
    expect(seen).toEqual(["a b"]);
  });
});

describe("onUncoveredText", () => {
  it("receives non-whitespace text nodes outside handled elements, in document order", () => {
    const root = body(
      `<div>lead <p>para</p> <span>mid</span> <nav>nav</nav><h2>Head</h2> tail</div>\n<aside>side</aside>`
    );
    const seen: string[] = [];
    const out = extractBlocks(root, DEFAULT_HANDLERS, {
      onUncoveredText: (t, ctx) => {
        expect(ctx.root).toBe(root);
        seen.push(t.data.trim());
      },
    });
    expect(seen).toEqual(["lead", "mid", "tail", "side"]);
    expect(texts(out)).toEqual(["para", "Head"]);
  });

  it("inserts returned outputs at the text node's position", () => {
    const root = body("<p>one</p><div>loose</div><p>two</p>");
    const out = extractBlocks(root, DEFAULT_HANDLERS, {
      onUncoveredText: (t) => [{ text: `u:${t.data}` }],
    });
    expect(texts(out)).toEqual(["one", "u:loose", "two"]);
  });

  it("lets the callback consume a run by marking later nodes covered", () => {
    const root = body("<div>a <em>b</em> c</div>");
    const out = extractBlocks(root, DEFAULT_HANDLERS, {
      onUncoveredText: (t, ctx) => {
        const parent = t.parentElement!;
        for (let n = t.nextSibling; n; n = n.nextSibling) ctx.markCovered(n);
        return [{ text: ctx.textOf(parent) }];
      },
    });
    expect(texts(out)).toEqual(["a b c"]);
  });

  it("defaults to the RAB-08 catch-all (uncovered text becomes text blocks)", () => {
    expect(DEFAULT_ON_UNCOVERED_TEXT).toBe(uncoveredTextHandler);
    expect(extractBlocks(body("<div>loose</div><p>kept</p>"))).toEqual([{ text: "loose" }, { text: "kept" }]);
  });

  it("drops uncovered text when given a no-op callback", () => {
    const out = extractBlocks(body("<div>loose</div><p>kept</p>"), DEFAULT_HANDLERS, { onUncoveredText: () => [] });
    expect(out).toEqual([{ text: "kept" }]);
  });

  it("exports the built-in handlers last in DEFAULT_HANDLERS", () => {
    expect(DEFAULT_HANDLERS.slice(-2)).toEqual([headingHandler, paragraphHandler]);
  });
});
