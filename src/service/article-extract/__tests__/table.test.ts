import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { JSDOM, VirtualConsole } from "jsdom";

import { ArticleParagraphSchema } from "../../../types/article";
import { selectContentRoot } from "../content-root";
import { createExtractContext, extractBlocks, type BlockOutput, type ExtractedBlock } from "../blocks";
import { tableHandler, MAX_TABLE_ROWS, MAX_TABLE_COLUMNS } from "../table";

const FIXTURES = path.resolve(__dirname, "../../__tests__/fixtures/html");

function parse(html: string): Document {
  return new JSDOM(html, { virtualConsole: new VirtualConsole() }).window.document;
}

function fixture(name: string): Document {
  return parse(readFileSync(path.join(FIXTURES, name), "utf8"));
}

function blocks(outputs: BlockOutput[]): ExtractedBlock[] {
  return outputs.filter((o): o is ExtractedBlock => o.kind !== "pending-figure");
}

const tables = (outputs: BlockOutput[]) => blocks(outputs).filter((b) => b.kind === "table");

/** Extract the single table block produced by `#id` in tables.html. */
function tableById(id: string): ExtractedBlock[] {
  const doc = fixture("tables.html");
  const el = doc.getElementById(id);
  if (!el) throw new Error(`no #${id}`);
  return blocks(tableHandler.extract(el, createExtractContext(doc.body)));
}

function only(id: string): ExtractedBlock {
  const out = tableById(id);
  expect(out).toHaveLength(1);
  return out[0]!;
}

function body(html: string): Element {
  return parse(`<!DOCTYPE html><html><body>${html}</body></html>`).body;
}

describe("tableHandler — reference fixture", () => {
  const outputs = extractBlocks(selectContentRoot(fixture("reference-ai-native-sdlc.html")));
  const all = tables(outputs);

  it("yields exactly one table with the expected headers and 6 rows", () => {
    expect(all).toHaveLength(1);
    const t = all[0]!.table!;
    expect(t.headers).toEqual(["Stage", "Traditional SDLC", "AI-native SDLC"]);
    expect(t.rows).toHaveLength(6);
    expect(t.rows.map((r) => r[0])).toEqual(["Plan", "Design", "Build", "Test", "Deploy", "Maintain"]);
    expect(t.rows.every((r) => r.length === 3)).toBe(true);
    expect(t.truncated).toBeUndefined();
  });

  it("keeps inline <code> as text in cells", () => {
    const t = all[0]!.table!;
    expect(t.rows[0]![2]).toContain("within intent.md which is human readable");
    expect(t.rows[2]![2]).toContain("CLAUDE.md");
  });

  it("does not emit cell text as any other block", () => {
    // Paragraph blocks only: the stage names ("Plan", …) are also genuine h2 headings.
    const others = blocks(outputs).filter((b) => b.kind === undefined || b.kind === "text");
    const cellTexts = all[0]!.table!.rows.flat().concat(all[0]!.table!.headers);
    for (const cell of cellTexts) {
      for (const block of others) expect(block.text).not.toBe(cell);
    }
    expect(others.some((b) => b.text.includes("Requirements gathered by committee"))).toBe(false);
  });

  it("flattens to `header: cell` lines", () => {
    const lines = all[0]!.text.split("\n");
    expect(lines).toHaveLength(6);
    expect(lines[3]).toBe(
      "Stage: Test; Traditional SDLC: QA gates at stage boundaries; AI-native SDLC: Continuous evals woven through implementation"
    );
  });

  it("validates against ArticleParagraphSchema", () => {
    expect(ArticleParagraphSchema.safeParse({ ...all[0]!, index: 7 }).success).toBe(true);
  });
});

describe("tableHandler — tables.html", () => {
  it("is registered: the fixture yields one block per non-empty table, in order", () => {
    const outputs = blocks(extractBlocks(selectContentRoot(fixture("tables.html"))));
    const kinds = outputs.map((b) => b.kind ?? "text");
    expect(kinds).toEqual(["text", "table", "table", "table", "table", "table", "table", "table", "text"]);
    for (const [i, b] of outputs.entries()) {
      expect(ArticleParagraphSchema.safeParse({ ...b, index: i }).success).toBe(true);
    }
  });

  it("uses the <thead> row as headers", () => {
    const b = only("thead");
    expect(b).toEqual({
      kind: "table",
      text: "Name: Alice; Role: Author\nName: Bob; Role: Reviewer",
      table: { headers: ["Name", "Role"], rows: [["Alice", "Author"], ["Bob", "Reviewer"]] },
    });
  });

  it("uses an all-<th> first row as headers", () => {
    const b = only("all-th-first-row");
    expect(b.table).toEqual({ headers: ["Book", "Chapters"], rows: [["Genesis", "50"], ["Exodus", "40"]] });
    expect(b.text).toBe("Book: Genesis; Chapters: 50\nBook: Exodus; Chapters: 40");
  });

  it("has no headers when neither applies", () => {
    const b = only("no-header");
    expect(b.table).toEqual({ headers: [], rows: [["a1", "b1"], ["a2", "b2"]] });
    expect(b.text).toBe("a1; b1\na2; b2");
  });

  it("places colspan/rowspan text in the first spanned cell", () => {
    const b = only("spans");
    expect(b.table).toEqual({
      headers: ["A", "B", "C"],
      rows: [
        ["A1-B1 spanned", "", "C1"],
        ["A2-A3 spanned", "B2", "C2"],
        ["", "B3", "C3"],
        ["A4", "B4-C5 spanned", ""],
        ["A5", "", ""],
      ],
    });
    expect(b.text).toBe(
      ["A: A1-B1 spanned; C: C1", "A: A2-A3 spanned; B: B2; C: C2", "B: B3; C: C3", "A: A4; B: B4-C5 spanned", "A: A5"].join(
        "\n"
      )
    );
  });

  it("flattens a list in a cell with `; `", () => {
    const b = only("list-in-cell");
    expect(b.table).toEqual({ headers: ["Topic", "Points"], rows: [["Faith", "Hope; Trust"]] });
    expect(b.text).toBe("Topic: Faith; Points: Hope; Trust");
  });

  it("skips empty tables and tables of empty cells", () => {
    expect(tableById("empty")).toEqual([]);
    expect(tableById("empty-cells")).toEqual([]);
  });

  it("truncates a 60-row table to 50 rows", () => {
    const b = only("sixty-rows");
    expect(b.table!.rows).toHaveLength(MAX_TABLE_ROWS);
    expect(b.table!.rows[49]).toEqual(["Row 50", "Value 50"]);
    expect(b.table!.truncated).toBe(true);
    expect(b.text.split("\n")).toHaveLength(50);
  });

  it("truncates a 14-column table to 12 columns (headers too)", () => {
    const b = only("fourteen-cols");
    expect(b.table!.headers).toHaveLength(MAX_TABLE_COLUMNS);
    expect(b.table!.headers[11]).toBe("Col 12");
    expect(b.table!.rows).toHaveLength(2);
    expect(b.table!.rows.every((r) => r.length === MAX_TABLE_COLUMNS)).toBe(true);
    expect(b.table!.rows[1]![11]).toBe("R2C12");
    expect(b.table!.truncated).toBe(true);
    expect(b.text).not.toContain("R1C13");
  });
});

describe("tableHandler — cell content and structure", () => {
  const one = (html: string) => tables(extractBlocks(body(html)));

  it("strips links, turns <br> into a space, skips excluded content, collapses whitespace", () => {
    const [b] = one(
      `<table><tr><td><a href="/x">Link   text</a><br>next<span hidden>secret</span><button>Copy</button></td></tr></table>`
    );
    expect(b!.table!.rows).toEqual([["Link text next"]]);
  });

  it("separates block-level children inside a cell", () => {
    const [b] = one(`<table><tr><td><p>One</p><p>Two</p></td></tr></table>`);
    expect(b!.table!.rows).toEqual([["One Two"]]);
  });

  it("pads ragged rows with empty strings", () => {
    const [b] = one(`<table><tr><td>a</td></tr><tr><td>b</td><td>c</td><td>d</td></tr></table>`);
    expect(b!.table!.rows).toEqual([["a", "", ""], ["b", "c", "d"]]);
  });

  it("ignores nested tables' rows and flattens their text into the cell", () => {
    const out = one(
      `<table><tr><td>outer</td><td><table><tr><td>in1</td><td>in2</td></tr><tr><td>in3</td></tr></table></td></tr></table>`
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.table!.rows).toEqual([["outer", "in1 in2 in3"]]);
  });

  it("reads thead/tbody/tfoot rows in document order", () => {
    const [b] = one(
      `<table><thead><tr><th>H</th></tr></thead><tbody><tr><td>body</td></tr></tbody><tfoot><tr><td>foot</td></tr></tfoot></table>`
    );
    expect(b!.table).toEqual({ headers: ["H"], rows: [["body"], ["foot"]] });
  });

  it("falls back to header names for text when all body cells are empty", () => {
    const [b] = one(`<table><thead><tr><th>X</th><th>Y</th></tr></thead><tbody><tr><td></td><td></td></tr></tbody></table>`);
    expect(b!.text).toBe("X; Y");
    expect(b!.table).toEqual({ headers: ["X", "Y"], rows: [["", ""]] });
  });
});
