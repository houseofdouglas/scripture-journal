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
    savedAnnotations: SavedAnnotation[];
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
          {/* Add note button in left gutter */}
          {annotation && annotation.openBlockId === null && (
            <button
              onClick={() => annotation.onOpen(p.index)}
              aria-label="Add note"
              title="Add note"
              className="mt-1 flex-shrink-0 select-none text-xs text-blue-500 hover:bg-blue-50 rounded-full w-5 h-5 flex items-center justify-center transition-all"
            >
              +
            </button>
          )}
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
              .filter((a) => a.blockId === p.index)
              .map((a, i) => (
                <SavedAnnotationDisplay key={i} text={a.text} createdAt={a.createdAt} />
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
