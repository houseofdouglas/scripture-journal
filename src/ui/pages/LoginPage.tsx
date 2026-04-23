import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import type { LoginResponse } from "../../types";

type Status = "idle" | "loading" | "invalid-credentials" | "rate-limited";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnPath = searchParams.get("return") ?? "/";
  const isSessionExpired = searchParams.has("return");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("loading");

    try {
      // Use raw fetch — apiClient would redirect on 401, but here 401 means wrong credentials
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        if (res.status === 429) {
          setStatus("rate-limited");
        } else {
          setStatus("invalid-credentials");
          setPassword("");
        }
        return;
      }
      const result = (await res.json()) as LoginResponse;
      login(result.token, result.expiresAt);
      navigate(returnPath, { replace: true });
    } catch {
      setStatus("invalid-credentials");
      setPassword("");
    }
  }

  const isLoading = status === "loading";
  const isRateLimited = status === "rate-limited";
  const formDisabled = isLoading || isRateLimited;

  return (
    <div className="mx-auto mt-24 max-w-sm">
      <h1 className="mb-6 text-2xl font-semibold text-gray-900">Sign in</h1>

      {/* Session-expired alert */}
      {isSessionExpired && status === "idle" && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800"
        >
          Your session has expired. Please sign in again.
        </div>
      )}

      {/* Invalid credentials alert */}
      {status === "invalid-credentials" && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          Invalid username or password.
        </div>
      )}

      {/* Rate-limited alert */}
      {isRateLimited && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          Too many attempts. Please wait a moment before trying again.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="username"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Username
          </label>
          <input
            id="username"
            type="text"
            autoComplete="username"
            required
            disabled={formDisabled}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={`w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 ${
              status === "invalid-credentials"
                ? "border-red-400"
                : "border-gray-300"
            }`}
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            disabled={formDisabled}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 ${
              status === "invalid-credentials"
                ? "border-red-400"
                : "border-gray-300"
            }`}
          />
        </div>

        <button
          type="submit"
          disabled={formDisabled}
          className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-blue-300"
        >
          {isLoading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
