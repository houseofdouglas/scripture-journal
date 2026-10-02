/* eslint vitest/expect-expect: ["error", { assertFunctionNames: ["expect", "expectNoLoss"] }] */
// No-loss property (spec rich-article-blocks, Happy Path AC "No-loss property";
// FR-3, FR-14): every visible character of the content root — minus FR-14
// exclusions — appears in the extracted blocks exactly once, in document order.
//
// Expected: the root's text nodes in document order, skipping excluded subtrees
// and inline-SVG drawings (their text is part of the image, not article text).
// Actual: the outputs of `extractBlocks(root)` in order, each contributing its
// *source* text rather than its flattened `text` (which adds list markers and
// repeats table headers per row):
//   - text / heading blocks → `text`
//   - list → item texts, pre-order
//   - code → `content`
//   - table → headers, then rows cell by cell, with the FR-7 "; " list-item
//     separator removed (it is inserted by extraction, not source text)
//   - pending-figure → `caption` (`alt` is not visible text)
//
// Comparison is on the whitespace-stripped character stream. Words cannot be
// compared token-by-token because extraction joins adjacent inline text nodes
// the way `textContent` does (`marker<sup>1</sup>.` → "marker1."), which a
// per-text-node split would not. Stripping whitespace keeps the property exact:
// a dropped, duplicated, or reordered word changes the stream.
//
// Tolerated by construction (no known gaps in the fixtures below):
//   - a table's header row is emitted before its body rows; this matches DOM
//     order for every fixture table (single `<thead>` first);
//   - truncated lists/tables/code drop content by design, so the intentionally
//     truncated tables in tables.html are removed before checking.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { JSDOM, VirtualConsole } from "jsdom";

import type { ListItem } from "../../../types/article";
import { selectContentRoot } from "../content-root";
import { extractBlocks, type BlockOutput } from "../blocks";
import { isInsideExcluded } from "../exclusions";

const FIXTURES = path.resolve(__dirname, "../../__tests__/fixtures/html");
const SVG_NS = "http://www.w3.org/2000/svg";

function fixture(name: string): Document {
  const html = readFileSync(path.join(FIXTURES, name), "utf8");
  return new JSDOM(html, { virtualConsole: new VirtualConsole() }).window.document;
}

/** Visible text pieces of `root` in document order (FR-14 exclusions and SVG drawings skipped). */
function expectedPieces(root: Element): string[] {
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  const pieces: string[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent || isInsideExcluded(parent, root)) continue;
    if (parent.closest("svg") && parent.namespaceURI === SVG_NS) continue;
    pieces.push((node as Text).data);
  }
  return pieces;
}

function listItemTexts(items: ListItem[], out: string[]): void {
  for (const item of items) {
    out.push(item.text);
    if (item.children) listItemTexts(item.children, out);
  }
}

/** Source text of each output, in order. */
function actualPieces(outputs: BlockOutput[]): string[] {
  const pieces: string[] = [];
  for (const o of outputs) {
    if (o.kind === "pending-figure") {
      pieces.push(o.caption);
    } else if (o.kind === "list") {
      listItemTexts(o.list!.items, pieces);
    } else if (o.kind === "code") {
      pieces.push(o.code!.content);
    } else if (o.kind === "table") {
      // FR-7 joins a list inside a cell with "; " — inserted, not source text.
      const cell = (c: string) => c.split("; ").join(" ");
      pieces.push(...o.table!.headers.map(cell));
      for (const row of o.table!.rows) pieces.push(...row.map(cell));
    } else {
      pieces.push(o.text);
    }
  }
  return pieces;
}

const stream = (pieces: string[]): string => pieces.join("").replace(/\s+/g, "");

/** Assert the property; on failure, show context around the first divergence. */
function expectNoLoss(root: Element): BlockOutput[] {
  const outputs = extractBlocks(root);
  const expected = stream(expectedPieces(root));
  const actual = stream(actualPieces(outputs));
  if (expected !== actual) {
    let i = 0;
    while (i < expected.length && expected[i] === actual[i]) i += 1;
    const ctx = (s: string) => s.slice(Math.max(0, i - 80), i + 80);
    expect.fail(
      `no-loss diverges at char ${i} (expected ${expected.length}, actual ${actual.length})\n` +
        `expected: …${ctx(expected)}…\nactual:   …${ctx(actual)}…`
    );
  }
  expect(expected.length).toBeGreaterThan(0);
  return outputs;
}

describe("no-loss property", () => {
  it("holds for the reference article", () => {
    const outputs = expectNoLoss(selectContentRoot(fixture("reference-ai-native-sdlc.html")));
    // Sanity: figures are active and their captions are counted.
    expect(outputs.filter((o) => o.kind === "pending-figure").length).toBe(4);
  });

  it("holds for the general-conference talk", () => {
    expectNoLoss(selectContentRoot(fixture("talk.html")));
  });

  it("holds for callouts-hidden.html (root = body)", () => {
    expectNoLoss(fixture("callouts-hidden.html").body);
  });

  it("holds for lists.html", () => {
    expectNoLoss(fixture("lists.html").body);
  });

  it("holds for code.html", () => {
    expectNoLoss(fixture("code.html").body);
  });

  it("holds for tables.html, minus the intentionally truncated tables", () => {
    const doc = fixture("tables.html");
    for (const id of ["sixty-rows", "fourteen-cols"]) doc.getElementById(id)!.remove();
    expectNoLoss(doc.body);
  });

  it("detects a lost word (the check is not vacuous)", () => {
    const doc = fixture("callouts-hidden.html");
    const outputs = extractBlocks(doc.body).slice(1); // drop the first block
    expect(stream(actualPieces(outputs))).not.toBe(stream(expectedPieces(doc.body)));
  });
});
