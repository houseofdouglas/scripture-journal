import { useState, useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiClient, ApiError } from "../lib/api-client";
import { JournalEntrySchema } from "../../types";
import type { AnnotateResponse } from "../../types";
import { buildEntryId } from "../lib/entry-id";
import { useAuth } from "../lib/auth-context";
import { useProject } from "../lib/project-context";

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
  setContentTitle: (title: string) => void;
}

interface UseAnnotationEditorOptions {
  date: string;         // client's local YYYY-MM-DD
  contentRef: string;
  contentTitle: string;
  contentType: "scripture" | "article";
  /** Override the derived entryId. Normally omitted — it is computed from (date, contentRef). */
  entryId?: string;
}

export function useAnnotationEditor(options: UseAnnotationEditorOptions): UseAnnotationEditorResult {
  const { user } = useAuth();
  const userId = user?.userId;
  const { activeProjectId } = useProject();
  const queryClient = useQueryClient();
  const [editor, setEditor] = useState<EditorState>({
    blockId: null,
    text: "",
    status: "idle",
    errorMessage: null,
  });
  const [contentTitle, setContentTitle] = useState(options.contentTitle);
  const [savedAnnotations, setSavedAnnotations] = useState<SavedAnnotation[]>([]);

  useEffect(() => {
    if (options.contentTitle) {
      setContentTitle(options.contentTitle);
    }
  }, [options.contentTitle]);

  useEffect(() => {
    setSavedAnnotations([]);
    setEditor({ blockId: null, text: "", status: "idle", errorMessage: null });
    let cancelled = false;
    const fetchEntry = async () => {
      if (!userId || !options.date || !options.contentRef) return;

      try {
        // entryId must match the server's derivation (annotation spec FR-6),
        // otherwise the GET below 404s and today's notes never come back.
        const entryId = options.entryId ?? (await buildEntryId(options.date, options.contentRef));
        const res = await fetch(`/users/${userId}/entries/${entryId}.json`);
        if (!res.ok) return; // 404 = no entry for today yet
        const entry = JournalEntrySchema.parse(await res.json());
        if (cancelled) return;
        setSavedAnnotations(
          entry.annotations.map((a) => ({ blockId: a.blockId, text: a.text, createdAt: a.createdAt }))
        );
      } catch {
        // Silently ignore a missing or malformed entry — never log note text (NFR-14)
      }
    };
    void fetchEntry();
    return () => {
      cancelled = true;
    };
  }, [options.date, options.contentRef, options.entryId, userId]);

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
        contentTitle,
        contentType: options.contentType,
        projectId: activeProjectId,
        blockId,
        text,
      });

      sessionStorage.removeItem("pendingNote");
      setSavedAnnotations((prev) => [
        ...prev,
        { blockId: result.annotation.blockId, text: result.annotation.text, createdAt: result.annotation.createdAt },
      ]);
      setEditor({ blockId: null, text: "", status: "idle", errorMessage: null });
      void queryClient.invalidateQueries({ queryKey: ["userIndex"] });
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
  }, [editor, options, contentTitle, activeProjectId, queryClient]);

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
    setContentTitle,
  };
}
