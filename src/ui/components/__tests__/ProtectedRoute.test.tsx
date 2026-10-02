// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { StrictMode } from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider } from "../../lib/auth-context";
import { ProtectedRoute } from "../ProtectedRoute";
import { LoginPage } from "../../pages/LoginPage";
import { stubMemoryLocalStorage } from "../../lib/__tests__/memory-storage";

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location">{loc.pathname + loc.search}</div>;
}

function renderAt(path: string) {
  // StrictMode matches main.tsx — it double-invokes state initializers, which
  // previously wiped an expired session before it could be reported
  return render(
    <StrictMode>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <LocationProbe />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <div>Dashboard</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </StrictMode>,
  );
}

function seedSession(expiresAt: string): void {
  localStorage.setItem("jwt", "token-abc");
  localStorage.setItem("jwt_expires_at", expiresAt);
  localStorage.setItem("jwt_username", "peter");
  localStorage.setItem("jwt_user_id", "u1");
}

beforeEach(() => {
  stubMemoryLocalStorage();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ProtectedRoute + LoginPage", () => {
  it("never-signed-in visitor is sent to /login?return=/ with no session-expired banner", () => {
    renderAt("/");

    expect(screen.getByTestId("location").textContent).toBe(
      "/login?return=%2F",
    );
    expect(screen.getByRole("heading", { name: /sign in/i })).toBeTruthy();
    expect(screen.queryByText(/session has expired/i)).toBeNull();
  });

  it("stored JWT past jwt_expires_at redirects with expired=1 and shows the banner", () => {
    seedSession(new Date(Date.now() - 60_000).toISOString());
    renderAt("/");

    expect(screen.getByTestId("location").textContent).toBe(
      "/login?return=%2F&expired=1",
    );
    expect(screen.getByText(/session has expired/i)).toBeTruthy();
    expect(localStorage.getItem("jwt")).toBeNull();
  });

  it("incomplete stored session is treated as expired", () => {
    localStorage.setItem("jwt", "token-abc");
    renderAt("/");

    expect(screen.getByTestId("location").textContent).toBe(
      "/login?return=%2F&expired=1",
    );
    expect(localStorage.getItem("jwt")).toBeNull();
  });

  it("valid stored session renders the protected page", () => {
    seedSession(new Date(Date.now() + 3_600_000).toISOString());
    renderAt("/");

    expect(screen.getByText("Dashboard")).toBeTruthy();
  });

  it("/login?return=… alone shows no banner", () => {
    renderAt("/login?return=%2Fscripture");
    expect(screen.queryByText(/session has expired/i)).toBeNull();
  });
});
