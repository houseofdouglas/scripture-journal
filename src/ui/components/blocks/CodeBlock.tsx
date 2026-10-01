import { useEffect, useRef, useState } from "react";
import type { CodePayload } from "../../../types";
import { TruncationNote } from "./TruncationNote";

interface Props {
  code: CodePayload;
}

type CopyStatus = "idle" | "copied" | "failed";

/** How long the "Copied" / "Copy failed" status stays visible before reverting to "Copy". */
export const COPY_STATUS_MS = 2000;

const LABELS: Record<CopyStatus, string> = {
  idle: "Copy",
  copied: "Copied",
  failed: "Copy failed",
};

/**
 * Renders a code block (FR-19): `<pre><code>` in monospace with whitespace preserved and
 * horizontal scrolling (no wrapping, never widens the page), an optional language label,
 * and a Copy button that places exactly `content` on the clipboard. The copy result is
 * announced via a polite live region. Content is a React text node — never HTML.
 */
export function CodeBlock({ code }: Props) {
  const [status, setStatus] = useState<CopyStatus>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);

  const show = (next: CopyStatus) => {
    if (!mounted.current) return;
    if (timer.current !== null) clearTimeout(timer.current);
    setStatus(next);
    timer.current = setTimeout(() => {
      timer.current = null;
      if (mounted.current) setStatus("idle");
    }, COPY_STATUS_MS);
  };

  const handleCopy = async () => {
    try {
      const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
      if (!clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await clipboard.writeText(code.content);
      show("copied");
    } catch {
      show("failed");
    }
  };

  return (
    <div>
      <div className="relative rounded border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center justify-end gap-2 px-3 pt-2">
          {code.language !== null && (
            <span data-testid="code-language" className="text-xs text-gray-500 dark:text-gray-400">
              {code.language}
            </span>
          )}
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            {LABELS[status]}
          </button>
        </div>
        <pre data-testid="code-scroll" className="overflow-x-auto whitespace-pre px-3 pb-3 pt-1 font-mono text-sm text-gray-900 dark:text-gray-100">
          <code>{code.content}</code>
        </pre>
        <span role="status" aria-live="polite" className="sr-only">
          {status === "idle" ? "" : LABELS[status]}
        </span>
      </div>
      {code.truncated === true && <TruncationNote kind="code" />}
    </div>
  );
}
