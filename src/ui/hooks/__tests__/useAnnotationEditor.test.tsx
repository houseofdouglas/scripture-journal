// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const USER_ID = "11111111-2222-4333-8444-555555555555";

// Stable object identities — a fresh literal per render would retrigger the effect.
const AUTH = { user: { userId: USER_ID, token: "t", username: "peter", expiresAt: 0 } };
const PROJECT = { activeProjectId: "personal" };

vi.mock("../../lib/auth-context", () => ({ useAuth: () => AUTH }));
vi.mock("../../lib/project-context", () => ({ useProject: () => PROJECT }));
vi.mock("../../lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api-client")>("../../lib/api-client");
  return { ...actual, apiClient: { post: vi.fn(), get: vi.fn() } };
});

import { useAnnotationEditor } from "../useAnnotationEditor";
import { buildEntryId } from "../../lib/entry-id";

const DATE = "2026-08-26";
const CONTENT_REF = "content/scripture/book-of-mormon/1-nephi/1.json";
const EXPECTED_ENTRY_ID = "2026-08-26_874b693ab03e34da";

const ENTRY = {
  entryId: EXPECTED_ENTRY_ID,
  userId: USER_ID,
  date: DATE,
  contentRef: CONTENT_REF,
  contentTitle: "1 Nephi 1",
  contentType: "scripture" as const,
  projectId: "personal",
  annotations: [
    { blockId: 1, text: "First note", createdAt: "2026-08-26T09:00:00.000Z" },
    { blockId: 4, text: "Second note", createdAt: "2026-08-26T09:05:00.000Z" },
  ],
  updatedAt: "2026-08-26T09:05:00.000Z",
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderEditor() {
  return renderHook(
    () =>
      useAnnotationEditor({
        date: DATE,
        contentRef: CONTENT_REF,
        contentTitle: "1 Nephi 1",
        contentType: "scripture",
      }),
    { wrapper }
  );
}

describe("useAnnotationEditor() entry restore", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("GETs the entry at the spec-derived entryId", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    renderEditor();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(`/users/${USER_ID}/entries/${EXPECTED_ENTRY_ID}.json`);
    expect(await buildEntryId(DATE, CONTENT_REF)).toBe(EXPECTED_ENTRY_ID);
  });

  it("populates savedAnnotations from the fetched entry's annotations[]", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(ENTRY)));

    const { result } = renderEditor();

    await waitFor(() => expect(result.current.savedAnnotations).toHaveLength(2));
    expect(result.current.savedAnnotations).toEqual([
      { blockId: 1, text: "First note", createdAt: "2026-08-26T09:00:00.000Z" },
      { blockId: 4, text: "Second note", createdAt: "2026-08-26T09:05:00.000Z" },
    ]);
  });

  it("stays empty and does not throw on a 404", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));

    const { result } = renderEditor();

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(result.current.savedAnnotations).toEqual([]);
    expect(result.current.errorMessage).toBeNull();
  });
});
