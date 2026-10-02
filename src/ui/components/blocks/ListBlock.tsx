import type { ListItem, ListPayload } from "../../../types";
import { TruncationNote } from "./TruncationNote";

interface Props {
  list: ListPayload;
}

interface ItemsProps {
  ordered: boolean;
  start?: number;
  items: ListItem[];
}

/** One `<ul>`/`<ol>` level; nested children reuse the parent's ordered-ness. */
function ListItems({ ordered, start, items }: ItemsProps) {
  const children = items.map((item, i) => (
    <li key={i}>
      {item.text}
      {item.children && item.children.length > 0 && <ListItems ordered={ordered} items={item.children} />}
    </li>
  ));
  return ordered ? (
    <ol start={start} className="list-decimal space-y-1 pl-6">
      {children}
    </ol>
  ) : (
    <ul className="list-disc space-y-1 pl-6">{children}</ul>
  );
}

/** Renders a list block as nested `<ul>` / `<ol start>` (FR-18), with the FR-21 note when capped. */
export function ListBlock({ list }: Props) {
  return (
    <div>
      <ListItems ordered={list.ordered} start={list.start} items={list.items} />
      {list.truncated === true && <TruncationNote kind="list" />}
    </div>
  );
}
