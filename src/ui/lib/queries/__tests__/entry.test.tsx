// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const USER_ID = "11111111-2222-4333-8444-555555555555";
const AUTH = { user: { userId: USER_ID, token: "t", username: "peter", expiresAt: 0 } };

vi.mock("../../auth-context", () => ({ useAuth: () => AUTH }));

import { useJournalEntry } from "../entry";

const ENTRY_ID = "2026-04-15_874b693ab03e34da";

const VALID_ENTRY = {
  entryId: ENTRY_ID,
  userId: USER_ID,
  date: "2026-04-15",
  contentRef: "content/scripture/book-of-mormon/alma/32.json",
  contentTitle: "Alma 32",
  contentType: "scripture" as const,
  projectId: "personal",
  annotations: [{ blockId: 1, text: "A note", createdAt: "2026-04-15T10:00:00.000Z" }],
  updatedAt: "2026-04-15T10:00:00.000Z",
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useJournalEntry()", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("fetches and validates the entry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(VALID_ENTRY)));

    const { result } = renderHook(() => useJournalEntry(ENTRY_ID), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(VALID_ENTRY));
    expect(fetch).toHaveBeenCalledWith(`/users/${USER_ID}/entries/${ENTRY_ID}.json`);
  });

  it("returns null on a 404", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));

    const { result } = renderHook(() => useJournalEntry(ENTRY_ID), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("errors on a malformed payload and never logs annotation text", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const malformed = { ...VALID_ENTRY, annotations: [{ blockId: 1 }] }; // missing text/createdAt
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(malformed)));

    const { result } = renderHook(() => useJournalEntry(ENTRY_ID), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(consoleSpy).toHaveBeenCalled();
    const loggedArgs = consoleSpy.mock.calls.flat().map(String).join(" ");
    expect(loggedArgs).not.toContain("A note");
    consoleSpy.mockRestore();
  });

  it("is disabled until an entryId is provided", () => {
    vi.stubGlobal("fetch", vi.fn());
    const { result } = renderHook(() => useJournalEntry(undefined), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(fetch).not.toHaveBeenCalled();
  });
});
