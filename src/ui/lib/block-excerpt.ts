import type { ArticleParagraph, BlockKind } from "../../types";

const PREFIXES: Partial<Record<BlockKind, string>> = {
  list: "List: ",
  code: "Code: ",
  table: "Table: ",
  figure: "Figure: ",
};

/**
 * Out-of-context excerpt for an article block (FR-24): the block's flattened
 * `text`, prefixed for list/code/table/figure. Text (default when `kind` is
 * absent) and heading blocks are unprefixed.
 */
export function blockExcerpt(block: Pick<ArticleParagraph, "kind" | "text">): string {
  const prefix = PREFIXES[block.kind ?? "text"] ?? "";
  return `${prefix}${block.text}`;
}
