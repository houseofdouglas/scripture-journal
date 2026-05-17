import { Link } from "react-router-dom";
import { useTheme, type Theme } from "../lib/theme-context";

const OPTIONS: { value: Theme; label: string; description: string }[] = [
  { value: "light", label: "Light", description: "Always use the light theme" },
  { value: "dark",  label: "Dark",  description: "Always use the dark theme" },
  { value: "system", label: "System", description: "Follow your device setting" },
];

export function AppearancePage() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="mx-auto mt-12 max-w-sm">
      <div className="mb-4">
        <Link
          to="/"
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          ← Dashboard
        </Link>
      </div>

      <h1 className="mb-2 text-2xl font-semibold text-gray-900 dark:text-gray-100">
        Appearance
      </h1>
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
        Choose how Scripture Journal looks to you.
      </p>

      <div className="space-y-2">
        {OPTIONS.map((opt) => {
          const active = theme === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => setTheme(opt.value)}
              className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
                active
                  ? "border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-950"
                  : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-gray-600 dark:hover:bg-gray-800"
              }`}
            >
              <div
                className={`text-sm font-medium ${
                  active
                    ? "text-blue-700 dark:text-blue-300"
                    : "text-gray-900 dark:text-gray-100"
                }`}
              >
                {opt.label}
              </div>
              <div
                className={`mt-0.5 text-xs ${
                  active
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-gray-500 dark:text-gray-400"
                }`}
              >
                {opt.description}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
