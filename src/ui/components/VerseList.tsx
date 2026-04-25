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

          {/* Verse number — fixed 2rem×2rem column so the bubble aligns exactly over it */}
          <div className="relative flex h-8 w-8 shrink-0 items-center justify-center">
            <span className="select-none text-xs font-semibold text-gray-400 tabular-nums">
              {verse.number}
            </span>

            {/* Sky-blue circle: inset-0 fills the container exactly, flex centers the "+".
                h-8/w-8 = 2rem (2× body font). font-size 1.5rem = 1.5× body font. */}
            {annotation && annotation.openBlockId === null && (
              <button
                onClick={() => annotation.onOpen(verse.number)}
                aria-label="Add note"
                title="Add note"
                className="absolute inset-0 flex items-center justify-center rounded-full bg-sky-100 text-blue-500 opacity-0 transition-opacity group-hover:opacity-100"
                style={{ fontSize: "1.5rem", lineHeight: 1 }}
              >
                +
              </button>
            )}
          </div>

          {/* Verse body */}
          <div className="flex-1">
            <p className="leading-relaxed text-gray-900" style={{ fontFamily: "Georgia, serif" }}>
              {verse.text}
            </p>

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
