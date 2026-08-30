// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const USER_ID = "11111111-2222-4333-8444-555555555555";
const AUTH = { user: { userId: USER_ID, token: "t", username: "peter", expiresAt: 0 } };

vi.mock("../../auth-context", () => ({ useAuth: () => AUTH }));

import { useUserIndex } from "../user-index";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useUserIndex()", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("fetches the user's index and returns its entries", async () => {
    const index = { entries: [{ entryId: "e1", date: "2026-08-12", contentRef: "content/scripture/x.json", contentTitle: "X", contentType: "scripture", projectId: "personal", snippet: "s", noteCount: 1 }] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(index)));

    const { result } = renderHook(() => useUserIndex(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(index));
    expect(fetch).toHaveBeenCalledWith(`/users/${USER_ID}/index.json`);
  });

  it("treats a 404 as an empty index", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));

    const { result } = renderHook(() => useUserIndex(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual({ entries: [] }));
  });
});
