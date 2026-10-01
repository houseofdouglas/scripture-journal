import type { ArticleParagraph } from "../../../types";
import { CodeBlock } from "./CodeBlock";
import { HeadingBlock } from "./HeadingBlock";
import { ListBlock } from "./ListBlock";
import { TableBlock } from "./TableBlock";

interface Props {
  block: ArticleParagraph;
}

/**
 * Inner content of one article block, dispatched on `kind`. The annotation gutter and
 * saved-note wrapper live in `ParagraphList`; this renders only the block body.
 * A missing payload (stored JSON is not re-validated client-side) falls back to plain text.
 * All text is rendered as React text nodes — never as HTML.
 */
export function BlockContent({ block }: Props) {
  switch (block.kind) {
    case "heading":
      if (block.heading) return <HeadingBlock text={block.text} heading={block.heading} />;
      break;
    case "list":
      if (block.list) return <ListBlock list={block.list} />;
      break;
    case "table":
      if (block.table) return <TableBlock table={block.table} />;
      break;
    case "code":
      if (block.code) return <CodeBlock code={block.code} />;
      break;
    case "figure":
      // TODO(RAB-18): replace with FigureBlock (<img>, figcaption, "View original size").
      if (block.figure) return <p>{block.figure.caption || block.text}</p>;
      break;
    default:
      break;
  }
  return <p>{block.text}</p>;
}
