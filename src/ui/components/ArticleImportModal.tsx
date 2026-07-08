import { useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient, ApiError } from "../lib/api-client";
import { extractPdfWithFallback, type ExtractSource } from "../lib/pdf-extract-client";
import type { ImportResponse } from "../../types";

type ModalState =
  | { mode: "url"; url: string; error?: string; fetchFailed?: boolean }
  | { mode: "pdf"; fileName: string; extracting?: boolean; error?: string }
  | {
      mode: "pdf-preview";
      fileName: string;
      title: string;
      paragraphs: string[];
      source: ExtractSource;
      error?: string;
    }
  | { mode: "manual"; url: string; text: string; title: string; error?: string }
  | { mode: "loading" }
  | { mode: "duplicate"; articleId: string; title: string; importedAt: string }
  | { mode: "new-version"; url: string; previousArticleId: string; previousImportedAt: string; title: string };

interface Props {
  onClose: () => void;
}

export function ArticleImportModal({ onClose }: Props) {
  const navigate = useNavigate();
  const [state, setState] = useState<ModalState>({ mode: "url", url: "" });

  async function handleUrlSubmit(e: FormEvent) {
    e.preventDefault();
    if (state.mode !== "url") return;

    setState({ mode: "loading" });

    try {
      const result = await apiClient.post<ImportResponse>("/articles/import", {
        url: state.url,
      });
      handleImportResponse(result, state.url);
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.body as { error?: string; fields?: Record<string, string> };
        if (body?.error === "FETCH_FAILED") {
          setState({ mode: "url", url: state.url, fetchFailed: true, error: "Could not fetch the article." });
        } else {
          setState({ mode: "url", url: state.url, error: "Something went wrong. Please try again." });
        }
      } else {
        setState({ mode: "url", url: (state as { url?: string }).url ?? "", error: "Network error." });
      }
    }
  }

  async function handleManualSubmit(e: FormEvent) {
    e.preventDefault();
    if (state.mode !== "manual") return;

    setState({ mode: "loading" });

    try {
      const result = await apiClient.post<ImportResponse>("/articles/import", {
        url: state.url,
        text: state.text,
        title: state.title,
      });
      handleImportResponse(result, state.url);
    } catch (err) {
      const errState = state;
      setState({ ...errState, error: "Could not import. Please try again." });
    }
  }

  async function handlePdfPreviewImport(e: FormEvent) {
    e.preventDefault();
    if (state.mode !== "pdf-preview") return;

    const { title, paragraphs, fileName, source } = state;
    setState({ mode: "loading" });

    try {
      const result = await apiClient.post<ImportResponse>("/articles/import", {
        text: paragraphs.join("\n\n"),
        title,
      });
      handleImportResponse(result, "");
    } catch {
      setState({
        mode: "pdf-preview",
        fileName,
        title,
        paragraphs,
        source,
        error: "Could not import. Please try again.",
      });
    }
  }

  async function handleConfirmNewVersion() {
    if (state.mode !== "new-version") return;
    const { url } = state;

    setState({ mode: "loading" });

    try {
      const result = await apiClient.post<ImportResponse>("/articles/import", {
        url,
        confirm: true,
      });
      handleImportResponse(result, url);
    } catch {
      setState({ mode: "url", url, error: "Could not import new version. Please try again." });
    }
  }

  function handleImportResponse(result: ImportResponse, url: string) {
    if (result.status === "DUPLICATE") {
      navigate(`/articles/${result.articleId}`);
    } else if (result.status === "NEW_VERSION") {
      setState({
        mode: "new-version",
        url,
        previousArticleId: result.previousArticleId,
        previousImportedAt: result.previousImportedAt,
        title: result.title,
      });
    } else {
      navigate(`/articles/${result.articleId}`);
    }
  }

  async function handlePdfFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const defaultTitle = file.name.replace(/\.pdf$/i, "").replace(/[-_]/g, " ");

    // Extract on selection rather than deferring to submit, so the user finds
    // out immediately if the file can't be read — lands on a preview step,
    // not a created article, so a bad extraction is never a fait accompli.
    setState({ mode: "pdf", fileName: file.name, extracting: true });

    try {
      const result = await extractPdfWithFallback(file);
      if (result.paragraphs.length === 0) {
        setState({ mode: "pdf", fileName: file.name, error: "Could not extract text from this PDF." });
        return;
      }
      setState({
        mode: "pdf-preview",
        fileName: file.name,
        title: result.suggestedTitle ?? defaultTitle,
        paragraphs: result.paragraphs,
        source: result.source,
      });
    } catch (err) {
      console.error("PDF extraction failed:", err);
      setState({ mode: "pdf", fileName: file.name, error: "Could not extract text from this PDF." });
    }
  }

  const isLoading = state.mode === "loading";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl dark:bg-gray-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Import Article</h2>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="text-gray-400 hover:text-gray-600 disabled:invisible dark:text-gray-500 dark:hover:text-gray-300"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {/* URL mode */}
          {state.mode === "url" && (
            <form onSubmit={handleUrlSubmit} className="space-y-4">
              <div>
                <label htmlFor="article-url" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Article URL
                </label>
                <input
                  id="article-url"
                  type="url"
                  placeholder="https://example.com/article"
                  required
                  value={state.url}
                  onChange={(e) => setState({ ...state, url: e.target.value, error: undefined as any })}
                  className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100 ${
                    state.error ? "border-red-400 dark:border-red-600" : "border-gray-300 dark:border-gray-600"
                  }`}
                />
                {state.error && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">{state.error}</p>
                )}
              </div>

              {state.fetchFailed && (
                <p className="text-sm">
                  <button
                    type="button"
                    onClick={() => setState({ mode: "manual", url: state.url, text: "", title: "" })}
                    className="text-blue-600 hover:underline dark:text-blue-400"
                  >
                    Paste article text manually instead →
                  </button>
                </p>
              )}

              <div className="flex gap-3 pt-1">
                <button type="submit" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                  Import
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
              </div>

              <div className="flex gap-4 border-t border-gray-100 pt-3 text-sm dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setState({ mode: "pdf", fileName: "" })}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  Import a PDF →
                </button>
                <button
                  type="button"
                  onClick={() => setState({ mode: "manual", url: "", text: "", title: "" })}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  Paste text →
                </button>
              </div>
            </form>
          )}

          {/* PDF mode — file picker */}
          {state.mode === "pdf" && (
            <div className="space-y-4">
              <div>
                <label htmlFor="pdf-file" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  PDF file
                </label>
                <input
                  id="pdf-file"
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={handlePdfFileChange}
                  disabled={state.extracting}
                  className="w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50 dark:text-gray-300 dark:file:bg-blue-900 dark:file:text-blue-300"
                />
                {state.fileName && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{state.fileName}</p>
                )}
              </div>
              {state.extracting && (
                <div className="flex h-16 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                  Extracting text…
                </div>
              )}
              {state.error && <p className="text-xs text-red-600 dark:text-red-400">{state.error}</p>}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setState({ mode: "url", url: "" })}
                  className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  ← Back
                </button>
              </div>
            </div>
          )}

          {/* PDF preview — read-only paragraph sanity check before creating the article */}
          {state.mode === "pdf-preview" && (
            <form onSubmit={handlePdfPreviewImport} className="space-y-4">
              {state.source === "local" && (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                  Cloud extraction unavailable — used local extraction.
                </p>
              )}
              <div>
                <label htmlFor="pdf-preview-title" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Title
                </label>
                <input
                  id="pdf-preview-title"
                  type="text"
                  required
                  value={state.title}
                  onChange={(e) => setState({ ...state, title: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />
              </div>
              <div>
                <p className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Preview ({state.paragraphs.length} paragraph{state.paragraphs.length === 1 ? "" : "s"})
                </p>
                <div className="max-h-64 space-y-3 overflow-y-auto rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
                  {state.paragraphs.map((p, i) => (
                    <p key={i} className="text-sm text-gray-700 dark:text-gray-300">
                      {p}
                    </p>
                  ))}
                </div>
              </div>
              {state.error && <p className="text-xs text-red-600 dark:text-red-400">{state.error}</p>}
              <div className="flex gap-3 pt-1">
                <button
                  type="submit"
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Import
                </button>
                <button
                  type="button"
                  onClick={() => setState({ mode: "url", url: "" })}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Loading */}
          {state.mode === "loading" && (
            <div className="flex h-24 items-center justify-center text-gray-500 dark:text-gray-400">
              Importing…
            </div>
          )}

          {/* Manual paste */}
          {state.mode === "manual" && (
            <form onSubmit={handleManualSubmit} className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">Paste the article text below.</p>
              <div>
                <label htmlFor="article-title" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Title
                </label>
                <input
                  id="article-title"
                  type="text"
                  required
                  value={state.title}
                  onChange={(e) => setState({ ...state, title: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />
              </div>
              <div>
                <label htmlFor="article-text" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Article text
                </label>
                <textarea
                  id="article-text"
                  required
                  rows={8}
                  value={state.text}
                  onChange={(e) => setState({ ...state, text: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />
              </div>
              {state.error && <p className="text-xs text-red-600 dark:text-red-400">{state.error}</p>}
              <div className="flex gap-3 pt-1">
                <button type="submit" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                  Import
                </button>
                <button
                  type="button"
                  onClick={() => setState({ mode: "url", url: state.url })}
                  className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  ← Back to URL
                </button>
              </div>
            </form>
          )}

          {/* Duplicate */}
          {state.mode === "duplicate" && (
            <div className="space-y-4">
              <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                <strong>Already imported</strong>
                <p className="mt-1">"{state.title}" was imported on {new Date(state.importedAt).toLocaleDateString()}.</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => navigate(`/articles/${state.articleId}`)}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Open Existing
                </button>
                <button
                  onClick={onClose}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* New version */}
          {state.mode === "new-version" && (
            <div className="space-y-4">
              <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200">
                <strong>Updated article detected</strong>
                <p className="mt-1">
                  This article has changed since it was last imported on{" "}
                  {new Date(state.previousImportedAt).toLocaleDateString()}.
                  Your previous annotations are preserved on the prior version.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleConfirmNewVersion}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Create New Version
                </button>
                <button
                  onClick={() => navigate(`/articles/${state.previousArticleId}`)}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Open Previous Version
                </button>
                <button
                  onClick={onClose}
                  className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
