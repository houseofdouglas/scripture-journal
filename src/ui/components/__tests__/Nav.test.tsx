// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockUseAuth = vi.fn();
vi.mock("../../lib/auth-context", () => ({ useAuth: () => mockUseAuth() }));

import { Nav } from "../Nav";
import { ProjectProvider } from "../../lib/project-context";
import { stubMemoryLocalStorage } from "../../lib/__tests__/memory-storage";

const USER = {
  userId: "u1",
  username: "peter",
  token: "t",
  expiresAt: "2999-01-01T00:00:00.000Z",
};

function renderNav() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ProjectProvider>
        <MemoryRouter initialEntries={["/login"]}>
          <Nav />
        </MemoryRouter>
      </ProjectProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  stubMemoryLocalStorage();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ projects: [] })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Nav — signed out", () => {
  beforeEach(() =>
    mockUseAuth.mockReturnValue({
      user: null,
      sessionExpired: false,
      logout: vi.fn(),
    }),
  );

  it("keeps the brand link but hides the app links and mobile toggle", () => {
    renderNav();

    expect(
      screen.getByRole("link", { name: "Scripture Journal" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("link", { name: /browse scripture/i }),
    ).toBeNull();
    expect(screen.queryByRole("link", { name: /browse articles/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /import article/i })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /toggle navigation menu/i }),
    ).toBeNull();
  });

  it("does not request /api/projects", async () => {
    renderNav();
    // Give TanStack Query a tick to (not) fire
    await new Promise((r) => setTimeout(r, 0));
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("Nav — signed in", () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      user: USER,
      sessionExpired: false,
      logout: vi.fn(),
    });
    localStorage.setItem("jwt", USER.token);
  });

  it("renders the app links", () => {
    renderNav();

    expect(
      screen.getAllByRole("link", { name: /browse scripture/i }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("link", { name: /browse articles/i }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("link", { name: /import article/i }).length,
    ).toBeGreaterThan(0);
  });

  it("fetches projects with the bearer token", async () => {
    renderNav();

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe("/api/projects");
    expect((init?.headers as Record<string, string>)["Authorization"]).toBe(
      `Bearer ${USER.token}`,
    );
  });
});
