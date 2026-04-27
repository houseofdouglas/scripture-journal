import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient, ApiError } from "../lib/api-client";
import type { ImportResponse } from "../../types";

type ModalState =
  | { mode: "url"; url: string; error?: string; fetchFailed?: boolean }
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
        if (body?.error === "DOMAIN_NOT_ALLOWED") {
          setState({ mode: "url", url: state.url, error: body.fields?.url ?? "Domain not allowed." });
        } else if (body?.error === "FETCH_FAILED") {
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
      setState({
        mode: "duplicate",
        articleId: result.articleId,
        title: result.title,
        importedAt: result.importedAt,
      });
    } else if (result.status === "NEW_VERSION") {
      setState({
        mode: "new-version",
        url,
        previousArticleId: result.previousArticleId,
        previousImportedAt: result.previousImportedAt,
        title: result.title,
      });
    } else {
      // IMPORTED or VERSION_IMPORTED
      navigate(`/articles/${result.articleId}`);
    }
  }

  const isLoading = state.mode === "loading";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Import Article</h2>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="text-gray-400 hover:text-gray-600 disabled:invisible"
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
                <label htmlFor="article-url" className="mb-1 block text-sm font-medium text-gray-700">
                  Article URL
                </label>
                <input
                  id="article-url"
                  type="url"
                  placeholder="https://www.churchofjesuschrist.org/…"
                  required
                  value={state.url}
                   onChange={(e) => setState({ ...state, url: e.target.value, error: undefined as any })}
                  className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    state.error ? "border-red-400" : "border-gray-300"
                  }`}
                />
                {state.error && (
                  <p className="mt-1 text-xs text-red-600">{state.error}</p>
                )}
              </div>

              {state.fetchFailed && (
                <p className="text-sm">
                  <button
                    type="button"
                    onClick={() =>
                      setState({ mode: "manual", url: state.url, text: "", title: "" })
                    }
                    className="text-blue-600 hover:underline"
                  >
                    Paste article text manually instead →
                  </button>
                </p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="submit"
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Import
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Loading */}
          {state.mode === "loading" && (
            <div className="flex h-24 items-center justify-center text-gray-500">
              Importing…
            </div>
          )}

          {/* Manual paste */}
          {state.mode === "manual" && (
            <form onSubmit={handleManualSubmit} className="space-y-4">
              <p className="text-sm text-gray-600">
                Paste the article text below.
              </p>
              <div>
                <label htmlFor="article-title" className="mb-1 block text-sm font-medium text-gray-700">
                  Title
                </label>
                <input
                  id="article-title"
                  type="text"
                  required
                  value={state.title}
                  onChange={(e) => setState({ ...state, title: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="article-text" className="mb-1 block text-sm font-medium text-gray-700">
                  Article text
                </label>
                <textarea
                  id="article-text"
                  required
                  rows={8}
                  value={state.text}
                  onChange={(e) => setState({ ...state, text: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {state.error && <p className="text-xs text-red-600">{state.error}</p>}
              <div className="flex gap-3 pt-1">
                <button
                  type="submit"
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Import
                </button>
                <button
                  type="button"
                  onClick={() => setState({ mode: "url", url: state.url })}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  ← Back to URL
                </button>
              </div>
            </form>
          )}

          {/* Duplicate */}
          {state.mode === "duplicate" && (
            <div className="space-y-4">
              <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <strong>Already imported</strong>
                <p className="mt-1">
                  "{state.title}" was imported on{" "}
                  {new Date(state.importedAt).toLocaleDateString()}.
                </p>
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
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* New version */}
          {state.mode === "new-version" && (
            <div className="space-y-4">
              <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
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
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Open Previous Version
                </button>
                <button
                  onClick={onClose}
                  className="text-sm text-gray-500 hover:text-gray-700"
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
