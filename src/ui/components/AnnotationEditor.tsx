import { useRef, useEffect } from "react";

interface Props {
  text: string;
  isSaving: boolean;
  errorMessage: string | null;
  onChange: (text: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

/**
 * Inline annotation editor.
 * Rendered in sans-serif (FR-45, NFR-40).
 * Auto-focuses textarea on open.
 */
export function AnnotationEditor({ text, isSaving, errorMessage, onChange, onSave, onCancel }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  return (
    <div className="mt-2 rounded-md border border-blue-300 bg-blue-50 p-3 font-sans">
      <textarea
        ref={textareaRef}
        rows={3}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        disabled={isSaving}
        placeholder="Write your note…"
        className="w-full resize-none rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
      />

      {/* Error strip */}
      {errorMessage && (
        <div className="mt-2 rounded bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">
          {errorMessage}
          <button
            onClick={onSave}
            className="ml-3 font-medium underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      <div className="mt-2 flex gap-2">
        <button
          onClick={onSave}
          disabled={isSaving || !text.trim()}
          className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:bg-blue-300"
        >
          {isSaving ? "Saving…" : "Save Note"}
        </button>
        <button
          onClick={onCancel}
          disabled={isSaving}
          className="text-xs text-gray-500 hover:text-gray-700 disabled:text-gray-300"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
