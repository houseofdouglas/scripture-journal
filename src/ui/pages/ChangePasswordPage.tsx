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

    // Client-side validation
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
      // Reset all fields
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setStatus("wrong-current");
        setCurrentPassword(""); // clear only current password
      } else {
        setStatus("error");
      }
    }
  }

  const isLoading = status === "loading";

  return (
    <div className="mx-auto mt-12 max-w-sm">
      <div className="mb-4">
        <Link to="/" className="text-sm text-gray-500 hover:text-gray-700">
          ← Dashboard
        </Link>
      </div>

      <h1 className="mb-6 text-2xl font-semibold text-gray-900">
        Change Password
      </h1>

      {/* Success */}
      {status === "success" && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
        >
          Password updated successfully. Your existing session stays active.
        </div>
      )}

      {/* Wrong current password */}
      {status === "wrong-current" && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          Current password is incorrect.
        </div>
      )}

      {/* Server error */}
      {status === "error" && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          Something went wrong. Please try again.
        </div>
      )}

      {/* Client-side validation error */}
      {clientError && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {clientError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="currentPassword"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
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
            className={`w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 ${
              status === "wrong-current" ? "border-red-400" : "border-gray-300"
            }`}
          />
        </div>

        <div>
          <label
            htmlFor="newPassword"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
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
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
          />
        </div>

        <div>
          <label
            htmlFor="confirmPassword"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
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
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
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
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:text-gray-400"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
