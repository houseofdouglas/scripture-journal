import { useState, useCallback } from "react";
import { apiClient, ApiError } from "../lib/api-client";
import type { AnnotateResponse } from "../../types";

export interface SavedAnnotation {
  blockId: number;
  text: string;
  createdAt: string;
}

interface EditorState {
  blockId: number | null;
  text: string;
  status: "idle" | "saving" | "error";
  errorMessage: string | null;
}

export interface UseAnnotationEditorResult {
  openBlockId: number | null;
  editorText: string;
  isSaving: boolean;
  errorMessage: string | null;
  savedAnnotations: SavedAnnotation[];
  openEditor: (blockId: number) => void;
  closeEditor: () => void;
  setEditorText: (text: string) => void;
  saveAnnotation: () => Promise<void>;
}

interface UseAnnotationEditorOptions {
  date: string;         // client's local YYYY-MM-DD
  contentRef: string;
  contentTitle: string;
  contentType: "scripture" | "article";
}

export function useAnnotationEditor(options: UseAnnotationEditorOptions): UseAnnotationEditorResult {
  const [editor, setEditor] = useState<EditorState>({
    blockId: null,
    text: "",
    status: "idle",
    errorMessage: null,
  });
  const [savedAnnotations, setSavedAnnotations] = useState<SavedAnnotation[]>([]);

  const openEditor = useCallback((blockId: number) => {
    setEditor((prev) => {
      // Only one editor open at a time
      if (prev.blockId !== null) return prev;
      return { blockId, text: "", status: "idle", errorMessage: null };
    });
  }, []);

  const closeEditor = useCallback(() => {
    setEditor({ blockId: null, text: "", status: "idle", errorMessage: null });
  }, []);

  const setEditorText = useCallback((text: string) => {
    setEditor((prev) => ({ ...prev, text }));
  }, []);

  const saveAnnotation = useCallback(async () => {
    const { blockId, text } = editor;
    if (blockId === null || !text.trim()) return;

    setEditor((prev) => ({ ...prev, status: "saving", errorMessage: null }));

    // Persist note before the call — survives a 401 redirect (api-client never rejects on 401)
    sessionStorage.setItem("pendingNote", text);

    try {
      const result = await apiClient.post<AnnotateResponse>("/entries/annotate", {
        date: options.date,
        contentRef: options.contentRef,
        contentTitle: options.contentTitle,
        contentType: options.contentType,
        blockId,
        text,
      });

      sessionStorage.removeItem("pendingNote");
      setSavedAnnotations((prev) => [
        ...prev,
        { blockId: result.annotation.blockId, text: result.annotation.text, createdAt: result.annotation.createdAt },
      ]);
      setEditor({ blockId: null, text: "", status: "idle", errorMessage: null });
    } catch (err) {
      // On 401: api-client redirects; just preserve error state
      if (err instanceof ApiError && err.status === 401) {
        // Store pending note for restoration after re-login
        sessionStorage.setItem("pendingNote", text);
        return; // redirect is in progress
      }

      const message =
        err instanceof ApiError && err.status === 409
          ? "Could not save your note (write conflict). Please try again."
          : "Could not save your note. Your text is preserved.";

      setEditor((prev) => ({ ...prev, status: "error", errorMessage: message }));
    }
  }, [editor, options]);

  return {
    openBlockId: editor.blockId,
    editorText: editor.text,
    isSaving: editor.status === "saving",
    errorMessage: editor.errorMessage,
    savedAnnotations,
    openEditor,
    closeEditor,
    setEditorText,
    saveAnnotation,
  };
}
