import type { SavedAnnotation } from "../hooks/useAnnotationEditor";
import { AnnotationEditor } from "./AnnotationEditor";
import { SavedAnnotationDisplay } from "./SavedAnnotation";

interface Paragraph {
  index: number;
  text: string;
}

interface Props {
  paragraphs: Paragraph[];
  annotation?: {
    openBlockId: number | null;
    editorText: string;
    isSaving: boolean;
    errorMessage: string | null;
    savedAnnotations?: SavedAnnotation[];
    onOpen: (blockId: number) => void;
    onClose: () => void;
    onTextChange: (text: string) => void;
    onSave: () => void;
  };
}

const getAnnotationCountText = (count: number): string => {
  if (count === 0) return "0 notes";
  if (count === 1) return "1 note";
  return `${count} notes`;
};

/**
 * Paragraph rendering component with annotation support.
 * Article text renders in a serif font (Georgia).
 * Annotation "+" editor is layered on.
 */
export function ParagraphList({ paragraphs, annotation }: Props) {
  const annotationCount = annotation?.savedAnnotations?.length ?? 0;

  return (
    <div className="space-y-4">
      {annotationCount > 0 && (
        <div className="mb-4 flex items-center gap-2 text-sm text-gray-600">
          <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium">
            {getAnnotationCountText(annotationCount)}
          </span>
        </div>
      )}
      {paragraphs.map((p) => (
        <div key={p.index} data-paragraph-index={p.index} className="group flex gap-3 leading-relaxed text-gray-900" style={{ fontFamily: "Georgia, serif" }}>
          {/* Left gutter — paragraph number with SVG plus overlay on hover */}
          <div className="relative flex h-8 w-8 shrink-0 items-start justify-center pt-1">
            <span className="select-none text-xs font-semibold text-gray-400 tabular-nums">
              {p.index + 1}
            </span>
            {annotation && annotation.openBlockId === null && (
              <button
                onClick={() => annotation.onOpen(p.index)}
                aria-label="Add note"
                title="Add note"
                className="absolute inset-0 flex items-center justify-center rounded-full bg-sky-100 opacity-0 transition-opacity group-hover:opacity-100"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <line x1="10" y1="3" x2="10" y2="17" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" />
                  <line x1="3" y1="10" x2="17" y2="10" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
          <div className="flex-1">
            <p>{p.text}</p>

            {/* Inline editor for this paragraph */}
            {annotation?.openBlockId === p.index && (
              <AnnotationEditor
                text={annotation.editorText}
                isSaving={annotation.isSaving}
                errorMessage={annotation.errorMessage}
                onChange={annotation.onTextChange}
                onSave={annotation.onSave}
                onCancel={annotation.onClose}
              />
            )}

            {/* Saved annotations beneath this paragraph */}
            {annotation?.savedAnnotations
              ?.filter((a) => a.blockId === p.index)
              .map((a, i) => (
                <SavedAnnotationDisplay key={i} text={a.text} createdAt={a.createdAt} />
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
