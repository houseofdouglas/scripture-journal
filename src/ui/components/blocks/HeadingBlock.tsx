import type { HeadingPayload } from "../../../types";

interface Props {
  text: string;
  heading: HeadingPayload;
}

// Levels 5 and 6 share the level-4 style (FR-17). The article title is the page's only <h1>.
const LEVEL_CLASSES: Record<HeadingPayload["level"], string> = {
  2: "text-2xl font-bold",
  3: "text-xl font-semibold",
  4: "text-lg font-semibold",
  5: "text-lg font-semibold",
  6: "text-lg font-semibold",
};

/** Renders a heading block with its matching semantic tag (`<h2>`–`<h6>`). */
export function HeadingBlock({ text, heading }: Props) {
  const Tag = `h${heading.level}` as const;
  return <Tag className={`${LEVEL_CLASSES[heading.level]} leading-snug`}>{text}</Tag>;
}
