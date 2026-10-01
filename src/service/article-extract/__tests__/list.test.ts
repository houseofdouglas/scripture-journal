import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { JSDOM, VirtualConsole } from "jsdom";

import { selectContentRoot } from "../content-root";
import { extractBlocks, type BlockOutput, type ExtractedBlock } from "../blocks";
import { listHandler, MAX_LIST_ITEMS } from "../list";
import { textOf } from "../exclusions";
import { ArticleParagraphSchema, type ListItem } from "../../../types/article";

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

const lists = (outputs: BlockOutput[]): ExtractedBlock[] =>
  blocks(outputs).filter((b) => b.kind === "list");

/** Extract the single list block produced from `el` by the handler. */
function listOf(el: Element | null): ExtractedBlock {
  if (!el) throw new Error("fixture element missing");
  const out = blocks(listHandler.extract(el, {} as never));
  expect(out).toHaveLength(1);
  const [block] = out;
  if (!block) throw new Error("no block");
  return block;
}

function allItemTexts(items: ListItem[]): string[] {
  return items.flatMap((i) => [i.text, ...allItemTexts(i.children ?? [])]);
}

function depthOf(items: ListItem[]): number {
  return items.reduce((max, i) => Math.max(max, 1 + depthOf(i.children ?? [])), 0);
}

describe("listHandler — reference article", () => {
  const doc = fixture("reference-ai-native-sdlc.html");
  const root = selectContentRoot(doc);
  const outputs = extractBlocks(root);
  const listBlocks = lists(outputs);

  it("yields 19 single-level list blocks, 14 ordered and 5 unordered, in document order", () => {
    expect(listBlocks).toHaveLength(19);
    expect(listBlocks.filter((b) => b.list?.ordered).length).toBe(14);
    expect(listBlocks.filter((b) => b.list?.ordered === false).length).toBe(5);

    const source = [...root.querySelectorAll("ul, ol")];
    expect(listBlocks.map((b) => b.list?.ordered)).toEqual(source.map((l) => l.tagName === "OL"));
    expect(listBlocks.map((b) => b.list?.items.map((i) => i.text))).toEqual(
      source.map((l) => [...l.querySelectorAll(":scope > li")].map((li) => textOf(li)))
    );
    for (const b of listBlocks) {
      expect(depthOf(b.list?.items ?? [])).toBe(1);
    }
  });

  it("emits no paragraph block that duplicates a list item", () => {
    const itemTexts = new Set(listBlocks.flatMap((b) => allItemTexts(b.list?.items ?? [])));
    const paragraphs = blocks(outputs).filter((b) => (b.kind ?? "text") === "text");
    for (const p of paragraphs) expect(itemTexts.has(p.text)).toBe(false);
  });

  it("every block validates against ArticleParagraphSchema", () => {
    listBlocks.forEach((b, index) => {
      expect(ArticleParagraphSchema.safeParse({ ...b, index }).success).toBe(true);
    });
  });
});

describe("listHandler — lists.html fixture", () => {
  const doc = fixture("lists.html");

  it("emits the expected list blocks in order (all-empty list dropped)", () => {
    const outputs = extractBlocks(selectContentRoot(doc));
    const listBlocks = lists(outputs);
    expect(listBlocks).toHaveLength(5);
    expect(blocks(outputs).map((b) => b.kind ?? "text")).toEqual([
      "text", "list", "list", "list", "list", "list", "text",
    ]);
    listBlocks.forEach((b, index) => {
      expect(ArticleParagraphSchema.safeParse({ ...b, index }).success).toBe(true);
    });
  });

  it("stores 4-level nesting as 3 levels with level-4 items at depth 3, in order", () => {
    const block = listOf(doc.getElementById("nested-four"));
    expect(block.list).toEqual({
      ordered: false,
      start: 1,
      items: [
        {
          text: "Level 1 item A",
          children: [
            {
              text: "Level 2 item A.1",
              children: [
                { text: "Level 3 item A.1.a" },
                { text: "Level 4 item A.1.a.i" },
                { text: "Level 4 item A.1.a.ii" },
                { text: "Level 3 item A.1.b" },
              ],
            },
            { text: "Level 2 item A.2" },
          ],
        },
        { text: "Level 1 item B" },
      ],
    });
    expect(block.text).toBe(
      [
        "- Level 1 item A",
        "  - Level 2 item A.1",
        "    1. Level 3 item A.1.a",
        "    - Level 4 item A.1.a.i",
        "    - Level 4 item A.1.a.ii",
        "    2. Level 3 item A.1.b",
        "  - Level 2 item A.2",
        "- Level 1 item B",
      ].join("\n")
    );
  });

  it("preserves start=5 and numbers the flattened text from it", () => {
    const block = listOf(doc.getElementById("start-five"));
    expect(block.list?.ordered).toBe(true);
    expect(block.list?.start).toBe(5);
    expect(block.text).toBe("5. Fifth step\n6. Sixth step\n7. Seventh step");
  });

  it("drops empty items", () => {
    const block = listOf(doc.getElementById("empty-items"));
    expect(block.list?.items).toEqual([{ text: "Kept item one" }, { text: "Kept item two" }]);
    expect(block.text).toBe("- Kept item one\n- Kept item two");
  });

  it("drops a list whose items are all empty", () => {
    const el = doc.getElementById("all-empty");
    if (!el) throw new Error("missing");
    expect(listHandler.extract(el, {} as never)).toEqual([]);
  });

  it("joins <p>s within an item with a single space", () => {
    const block = listOf(doc.getElementById("p-in-li"));
    expect(block.list?.items).toEqual([
      { text: "First paragraph inside an item. Second paragraph inside the same item." },
      { text: "Single paragraph item." },
    ]);
    expect(block.text).toBe(
      "1. First paragraph inside an item. Second paragraph inside the same item.\n2. Single paragraph item."
    );
  });

  it("flattens a <pre> inside an item to whitespace-collapsed text", () => {
    const block = listOf(doc.getElementById("pre-in-li"));
    expect(block.list?.items).toEqual([
      { text: "Run this command: npm install npm run build" },
      { text: "Then continue." },
    ]);
  });
});

describe("listHandler — synthetic cases", () => {
  it("truncates at 200 items and sets truncated", () => {
    const lis = Array.from({ length: 201 }, (_, i) => `<li>Item ${i + 1}</li>`).join("");
    const block = listOf(body(`<ol>${lis}</ol>`).querySelector("ol"));
    expect(block.list?.items).toHaveLength(MAX_LIST_ITEMS);
    expect(block.list?.truncated).toBe(true);
    expect(block.list?.items.at(-1)?.text).toBe("Item 200");
    expect(block.text.split("\n")).toHaveLength(200);
    expect(ArticleParagraphSchema.safeParse({ ...block, index: 0 }).success).toBe(true);
  });

  it("does not set truncated at exactly 200 items", () => {
    const lis = Array.from({ length: 200 }, (_, i) => `<li>Item ${i + 1}</li>`).join("");
    const block = listOf(body(`<ul>${lis}</ul>`).querySelector("ul"));
    expect(block.list?.items).toHaveLength(200);
    expect(block.list).not.toHaveProperty("truncated");
  });

  it("counts nested items toward the 200 cap", () => {
    const inner = Array.from({ length: 150 }, (_, i) => `<li>Sub ${i + 1}</li>`).join("");
    const outer = Array.from({ length: 60 }, (_, i) => `<li>Top ${i + 1}</li>`).join("");
    const block = listOf(body(`<ul><li>Parent<ul>${inner}</ul></li>${outer}</ul>`).querySelector("ul"));
    expect(block.list?.truncated).toBe(true);
    expect(allItemTexts(block.list?.items ?? [])).toHaveLength(200);
    expect(block.list?.items).toHaveLength(1 + 49);
  });

  it("keeps inline code as text and excludes hidden/excluded elements", () => {
    const block = listOf(
      body(
        `<ul><li>Run <code>npm test</code> now<button>Copy</button><span hidden>secret</span></li></ul>`
      ).querySelector("ul")
    );
    expect(block.list?.items).toEqual([{ text: "Run npm test now" }]);
  });

  it("flattens a table and figure inside an item", () => {
    const block = listOf(
      body(
        `<ul><li>See:<table><tr><td>a</td><td>b</td></tr></table><figure><img alt=""><figcaption>Cap</figcaption></figure></li></ul>`
      ).querySelector("ul")
    );
    expect(block.list?.items).toEqual([{ text: "See: a b Cap" }]);
  });

  it("nested lists keep their own type and nested ordered lists count from 1", () => {
    const block = listOf(
      body(`<ol start="3"><li>A<ol start="9"><li>x</li><li>y</li></ol></li><li>B<ul><li>z</li></ul></li></ol>`)
        .querySelector("ol")
    );
    expect(block.list?.start).toBe(3);
    expect(block.text).toBe("3. A\n  1. x\n  2. y\n4. B\n  - z");
  });

  it("ignores reversed and defaults a bad start to 1", () => {
    const block = listOf(body(`<ol reversed start="abc"><li>a</li><li>b</li></ol>`).querySelector("ol"));
    expect(block.list?.start).toBe(1);
    expect(block.text).toBe("1. a\n2. b");
  });

  it("keeps an empty-text item that has non-empty children", () => {
    const block = listOf(body(`<ul><li><ul><li>child</li></ul></li></ul>`).querySelector("ul"));
    expect(block.list?.items).toEqual([{ text: "", children: [{ text: "child" }] }]);
    expect(block.text).toBe("-\n  - child");
  });

  it("does not emit paragraphs inside items as separate blocks", () => {
    const outputs = extractBlocks(body(`<ul><li><p>One</p></li></ul><p>After</p>`));
    expect(blocks(outputs).map((b) => [b.kind ?? "text", b.text])).toEqual([
      ["list", "- One"],
      ["text", "After"],
    ]);
  });
});
