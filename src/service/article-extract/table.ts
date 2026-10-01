// Table handler (spec rich-article-blocks FR-7).
//
// `<table>` → `{ kind: "table", text, table: { headers, rows, truncated? } }`.
//   - Rows come from the table's own `<thead>`/`<tbody>`/`<tfoot>` sections and
//     direct `<tr>` children, in document order. Rows of nested tables are not
//     rows of this table; a nested table's text is flattened into its cell.
//   - `colspan`/`rowspan` are honoured: the cell's text goes in the first
//     spanned position and the other spanned positions are "". A rowspan never
//     crosses its row group (thead/tbody/tfoot), as in HTML.
//   - Headers: the last `<thead>` row; else a first row whose cells are all
//     `<th>`; else `[]`. The header row is not repeated in `rows`.
//   - Ragged rows are padded with "" to the widest row; caps are 50 body rows
//     × 12 columns (`truncated: true` when either is exceeded).
//   - Tables with no non-whitespace text are dropped.
//
// Only types are imported from `./blocks` (see its header comment).

import type { BlockHandler, BlockOutput } from "./blocks";
import { isExcluded, normalizeText } from "./exclusions";

export const MAX_TABLE_ROWS = 50;
export const MAX_TABLE_COLUMNS = 12;

/** HTML caps: colspan ≤ 1000, rowspan ≤ 65534 (rowspan is further limited to its row group). */
const MAX_COLSPAN = 1000;
const MAX_ROWSPAN = 65534;

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const CDATA_SECTION_NODE = 4;

const ROW_GROUPS: ReadonlySet<string> = new Set(["THEAD", "TBODY", "TFOOT"]);

/** Elements whose boundaries separate words in cell text (textContent would glue them). */
const BLOCK_BOUNDARY_TAGS: ReadonlySet<string> = new Set([
  "P", "DIV", "LI", "DT", "DD", "TABLE", "CAPTION", "TR", "TD", "TH", "PRE", "BLOCKQUOTE",
  "FIGURE", "FIGCAPTION", "H1", "H2", "H3", "H4", "H5", "H6", "SECTION", "ARTICLE", "ASIDE",
  "HEADER", "ADDRESS", "HR",
]);

type SourceRow = { tr: Element; group: number; inThead: boolean };

function tag(el: Element): string {
  return el.tagName.toUpperCase();
}

function elementChildren(el: Element): Element[] {
  const out: Element[] = [];
  for (let child = el.firstElementChild; child; child = child.nextElementSibling) out.push(child);
  return out;
}

/** This table's own rows, in document order, with their row-group number. */
function collectRows(table: Element): SourceRow[] {
  const rows: SourceRow[] = [];
  let group = 0;
  let looseGroup = -1; // consecutive direct <tr> children share one implicit group
  for (const child of elementChildren(table)) {
    if (isExcluded(child)) continue;
    const name = tag(child);
    if (ROW_GROUPS.has(name)) {
      group += 1;
      looseGroup = -1;
      for (const tr of elementChildren(child)) {
        if (tag(tr) === "TR" && !isExcluded(tr)) rows.push({ tr, group, inThead: name === "THEAD" });
      }
    } else if (name === "TR") {
      if (looseGroup === -1) {
        group += 1;
        looseGroup = group;
      }
      rows.push({ tr: child, group: looseGroup, inThead: false });
    }
  }
  return rows;
}

function cells(tr: Element): Element[] {
  return elementChildren(tr).filter((c) => (tag(c) === "TD" || tag(c) === "TH") && !isExcluded(c));
}

function spanAttr(el: Element, name: string, max: number): number {
  const value = Number.parseInt(el.getAttribute(name) ?? "", 10);
  if (!Number.isFinite(value) || value < 1) return 1; // rowspan="0" treated as 1
  return Math.min(value, max);
}

/**
 * Plain text of a cell: links/markup stripped, inline `<code>` kept as text,
 * `<br>` → space, lists → items joined with `; `, excluded descendants
 * skipped, whitespace collapsed.
 */
export function cellText(el: Element): string {
  const parts: string[] = [];
  collectCellText(el, parts);
  return normalizeText(parts.join(""));
}

function collectCellText(node: Element, parts: string[]): void {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.nodeType === TEXT_NODE || child.nodeType === CDATA_SECTION_NODE) {
      parts.push((child as CharacterData).data);
      continue;
    }
    if (child.nodeType !== ELEMENT_NODE) continue;
    const el = child as Element;
    if (isExcluded(el)) continue;
    const name = tag(el);
    if (name === "BR") {
      parts.push(" ");
    } else if (name === "UL" || name === "OL") {
      const items = elementChildren(el)
        .filter((li) => tag(li) === "LI" && !isExcluded(li))
        .map(cellText)
        .filter((t) => t !== "");
      parts.push(" ", items.join("; "), " ");
    } else if (BLOCK_BOUNDARY_TAGS.has(name)) {
      parts.push(" ");
      collectCellText(el, parts);
      parts.push(" ");
    } else {
      collectCellText(el, parts);
    }
  }
}

/** Place cells on a grid honouring colspan/rowspan. Columns ≥ `maxStoredCols` are tracked but not stored. */
function buildGrid(rows: SourceRow[], maxStoredCols: number): { grid: string[][]; width: number } {
  const occupied: Set<number>[] = rows.map(() => new Set<number>());
  const grid: string[][] = rows.map(() => []);
  let width = 0;

  // Last row index of each row group, to clamp rowspans.
  const groupEnd = new Map<number, number>();
  rows.forEach((r, i) => groupEnd.set(r.group, i));

  rows.forEach((row, r) => {
    let col = 0;
    for (const cell of cells(row.tr)) {
      while (occupied[r]!.has(col)) col += 1;
      const colspan = spanAttr(cell, "colspan", MAX_COLSPAN);
      const lastRow = Math.min(r + spanAttr(cell, "rowspan", MAX_ROWSPAN) - 1, groupEnd.get(row.group) ?? r);
      const text = cellText(cell);
      for (let rr = r; rr <= lastRow; rr += 1) {
        for (let cc = col; cc < col + colspan; cc += 1) {
          if (cc >= maxStoredCols) break;
          occupied[rr]!.add(cc);
          grid[rr]![cc] = rr === r && cc === col ? text : "";
        }
        // Positions past the stored range still need to count toward width.
        if (col + colspan > maxStoredCols) {
          for (let cc = Math.max(col, maxStoredCols); cc < col + colspan; cc += 1) occupied[rr]!.add(cc);
        }
      }
      width = Math.max(width, col + colspan);
      col += colspan;
    }
    for (const c of occupied[r]!) width = Math.max(width, c + 1);
  });

  return { grid, width };
}

function padRow(row: string[] | undefined, width: number): string[] {
  const out: string[] = [];
  for (let c = 0; c < width; c += 1) out.push(row?.[c] ?? "");
  return out;
}

function headerRowIndex(rows: SourceRow[]): number {
  let lastThead = -1;
  rows.forEach((r, i) => {
    if (r.inThead) lastThead = i;
  });
  if (lastThead !== -1) return lastThead;
  const first = rows[0];
  if (first) {
    const firstCells = cells(first.tr);
    if (firstCells.length > 0 && firstCells.every((c) => tag(c) === "TH")) return 0;
  }
  return -1;
}

/** Flattened `text`: one line per row, `header: cell; header: cell` (or `cell; cell`). */
export function flattenTable(headers: string[], rows: string[][]): string {
  const lines: string[] = [];
  for (const row of rows) {
    const parts: string[] = [];
    row.forEach((cell, c) => {
      if (cell === "") return;
      const header = headers[c] ?? "";
      parts.push(headers.length > 0 && header !== "" ? `${header}: ${cell}` : cell);
    });
    if (parts.length > 0) lines.push(parts.join("; "));
  }
  if (lines.length > 0) return lines.join("\n");
  return headers.filter((h) => h !== "").join("; ");
}

export const tableHandler: BlockHandler = {
  matches: (el) => tag(el) === "TABLE",
  extract: (el): BlockOutput[] => {
    const sourceRows = collectRows(el);
    // Store one column past the cap so the grid width reflects truncation.
    const { grid, width } = buildGrid(sourceRows, MAX_TABLE_COLUMNS + 1);
    const headerIndex = headerRowIndex(sourceRows);

    const columns = Math.min(width, MAX_TABLE_COLUMNS);
    let truncated = width > MAX_TABLE_COLUMNS;

    const headers = headerIndex === -1 ? [] : padRow(grid[headerIndex], columns);
    let rows = grid.filter((_, i) => i !== headerIndex).map((row) => padRow(row, columns));
    if (rows.length > MAX_TABLE_ROWS) {
      rows = rows.slice(0, MAX_TABLE_ROWS);
      truncated = true;
    }

    const text = flattenTable(headers, rows);
    if (text === "") return [];

    return [{ kind: "table", text, table: truncated ? { headers, rows, truncated: true } : { headers, rows } }];
  },
};
