interface Paragraph {
  index: number;
  text: string;
}

interface Props {
  paragraphs: Paragraph[];
}

/**
 * Pure paragraph rendering component.
 * Article text renders in a serif font (Georgia).
 * Annotation "+" editor is layered on in T23.
 */
export function ParagraphList({ paragraphs }: Props) {
  return (
    <div className="space-y-4">
      {paragraphs.map((p) => (
        <p
          key={p.index}
          data-paragraph-index={p.index}
          className="leading-relaxed text-gray-900"
          style={{ fontFamily: "Georgia, serif" }}
        >
          {p.text}
        </p>
      ))}
    </div>
  );
}
