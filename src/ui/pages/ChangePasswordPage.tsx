import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { apiClient, ApiError } from "../lib/api-client";

type Status = "idle" | "loading" | "success" | "wrong-current" | "error";

export function ChangePasswordPage() {
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [clientError, setClientError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setClientError(null);

    if (newPassword !== confirmPassword) {
      setClientError("New passwords do not match.");
      return;
    }
    if (newPassword === currentPassword) {
      setClientError("New password must be different from your current password.");
      return;
    }

    setStatus("loading");

    try {
      await apiClient.post("/auth/password", { currentPassword, newPassword });
      setStatus("success");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setStatus("wrong-current");
        setCurrentPassword("");
      } else {
        setStatus("error");
      }
    }
  }

  const isLoading = status === "loading";

  const inputClass = (error?: boolean) =>
    `w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 dark:bg-gray-800 dark:text-gray-100 dark:disabled:bg-gray-700 ${
      error
        ? "border-red-400 dark:border-red-600"
        : "border-gray-300 dark:border-gray-600"
    }`;

  return (
    <div className="mx-auto mt-12 max-w-sm">
      <div className="mb-4">
        <Link to="/" className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          ← Dashboard
        </Link>
      </div>

      <h1 className="mb-6 text-2xl font-semibold text-gray-900 dark:text-gray-100">
        Change Password
      </h1>

      {status === "success" && (
        <div role="alert" className="mb-4 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-300">
          Password updated successfully. Your existing session stays active.
        </div>
      )}

      {status === "wrong-current" && (
        <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          Current password is incorrect.
        </div>
      )}

      {status === "error" && (
        <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          Something went wrong. Please try again.
        </div>
      )}

      {clientError && (
        <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {clientError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="currentPassword" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Current password
          </label>
          <input
            id="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            disabled={isLoading}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className={inputClass(status === "wrong-current")}
          />
        </div>

        <div>
          <label htmlFor="newPassword" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            New password
          </label>
          <input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            disabled={isLoading}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={inputClass()}
          />
        </div>

        <div>
          <label htmlFor="confirmPassword" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Confirm new password
          </label>
          <input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            disabled={isLoading}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={inputClass()}
          />
        </div>

        <div className="flex gap-3 pt-1">
          <button
            type="submit"
            disabled={isLoading}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-blue-300"
          >
            {isLoading ? "Saving…" : "Update password"}
          </button>
          <button
            type="button"
            disabled={isLoading}
            onClick={() => navigate("/")}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:text-gray-400 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
            aria-label="Cancel"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
