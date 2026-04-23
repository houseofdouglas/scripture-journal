import type { Verse } from "../../types";
import { AnnotationEditor } from "./AnnotationEditor";
import { SavedAnnotationDisplay } from "./SavedAnnotation";
import type { SavedAnnotation } from "../hooks/useAnnotationEditor";

export interface AnnotationHandlers {
  openBlockId: number | null;
  editorText: string;
  isSaving: boolean;
  errorMessage: string | null;
  savedAnnotations: SavedAnnotation[];
  onOpen: (blockId: number) => void;
  onClose: () => void;
  onTextChange: (text: string) => void;
  onSave: () => void;
}

interface Props {
  verses: Verse[];
  annotation?: AnnotationHandlers;
}

export function VerseList({ verses, annotation }: Props) {
  return (
    <ol className="space-y-4">
      {verses.map((verse) => (
        <li key={verse.number} data-verse={verse.number} className="group flex gap-3">
          {/* Verse number */}
          <span className="select-none pt-0.5 text-xs font-semibold text-gray-400 tabular-nums">
            {verse.number}
          </span>

          {/* Verse body */}
          <div className="flex-1">
            <div className="flex items-start gap-2">
              <p
                className="flex-1 leading-relaxed text-gray-900"
                style={{ fontFamily: "Georgia, serif" }}
              >
                {verse.text}
              </p>

              {/* "+" button — only shown when no editor is open */}
              {annotation && annotation.openBlockId === null && (
                <button
                  onClick={() => annotation.onOpen(verse.number)}
                  aria-label="Add note"
                  className="mt-0.5 flex-shrink-0 select-none text-sm font-medium text-gray-300 opacity-0 transition-opacity hover:text-blue-600 group-hover:opacity-100"
                >
                  +
                </button>
              )}
            </div>

            {/* Inline editor for this verse */}
            {annotation?.openBlockId === verse.number && (
              <AnnotationEditor
                text={annotation.editorText}
                isSaving={annotation.isSaving}
                errorMessage={annotation.errorMessage}
                onChange={annotation.onTextChange}
                onSave={annotation.onSave}
                onCancel={annotation.onClose}
              />
            )}

            {/* Saved annotations beneath this verse */}
            {annotation?.savedAnnotations
              .filter((a) => a.blockId === verse.number)
              .map((a, i) => (
                <SavedAnnotationDisplay key={i} text={a.text} createdAt={a.createdAt} />
              ))}
          </div>
        </li>
      ))}
    </ol>
  );
}
