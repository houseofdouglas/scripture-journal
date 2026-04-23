import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth-context";

/**
 * Global navigation bar.
 *
 * Left: logo / app name → Dashboard
 * Center: Browse Scripture · Import Article
 * Right: username dropdown → Change Password · Log Out
 */
export function Nav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  function handleLogout() {
    setDropdownOpen(false);
    logout();
    navigate("/login");
  }

  return (
    <nav className="border-b border-gray-200 bg-white px-6 py-3 flex items-center justify-between">
      {/* Logo */}
      <Link
        to="/"
        className="text-lg font-semibold text-gray-900 hover:text-gray-700"
      >
        Scripture Journal
      </Link>

      {/* Centre links */}
      <div className="flex gap-6 text-sm text-gray-700">
        <Link to="/scripture" className="hover:text-gray-900">
          Browse Scripture
        </Link>
        <Link to="/import" className="hover:text-gray-900">
          Import Article
        </Link>
      </div>

      {/* User dropdown */}
      {user && (
        <div className="relative">
          <button
            onClick={() => setDropdownOpen((o) => !o)}
            className="flex items-center gap-1 text-sm text-gray-700 hover:text-gray-900"
            aria-haspopup="true"
            aria-expanded={dropdownOpen}
          >
            {user.username}
            <svg
              className="h-4 w-4"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>

          {dropdownOpen && (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 z-10"
                onClick={() => setDropdownOpen(false)}
                aria-hidden="true"
              />
              {/* Menu */}
              <div className="absolute right-0 z-20 mt-2 w-44 origin-top-right rounded-md border border-gray-200 bg-white shadow-md">
                <Link
                  to="/settings/password"
                  onClick={() => setDropdownOpen(false)}
                  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Change Password
                </Link>
                <button
                  onClick={handleLogout}
                  className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                >
                  Log Out
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </nav>
  );
}
