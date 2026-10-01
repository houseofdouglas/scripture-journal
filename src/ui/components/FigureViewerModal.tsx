import { useEffect, useId, useRef } from "react";

interface Props {
  src: string;
  /** Intrinsic width in px; the image is rendered at exactly this many CSS px. */
  width: number;
  /** Intrinsic height in px. */
  height: number;
  alt: string;
  caption: string;
  onClose: () => void;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Original-size figure viewer (FR-23). Mirrors the `NoteHistoryModal` dialog pattern: focus
 * moves into the dialog, Tab is trapped, Esc / close button / backdrop close it, body scroll is
 * locked, and focus returns to the previously focused element (the trigger) on close.
 */
export function FigureViewerModal({ src, width, height, alt, caption, onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const captionId = useId();

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
      scrollRef.current.scrollLeft = 0;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (!dialog.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.body.style.overflow = originalOverflow;
      previouslyFocused?.focus();
    };
  }, [onClose]);

  const labelProps = caption ? { "aria-labelledby": captionId } : { "aria-label": alt || "Figure" };

  return (
    <div
      data-testid="figure-viewer-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        {...labelProps}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-[90vw] flex-col rounded-lg bg-white p-4 shadow-xl dark:bg-gray-900"
      >
        <div className="mb-3 flex items-center justify-between gap-4">
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 underline hover:no-underline dark:text-blue-400"
          >
            Open in new tab
          </a>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Close
          </button>
        </div>
        <div ref={scrollRef} data-testid="figure-viewer-scroll" className="min-h-0 flex-1 overflow-auto">
          <img
            src={src}
            alt={alt}
            width={width}
            height={height}
            style={{ display: "block", width: `${width}px`, height: `${height}px`, maxWidth: "none" }}
          />
        </div>
        {caption ? (
          <p id={captionId} className="mt-3 text-sm text-gray-600 dark:text-gray-400">
            {caption}
          </p>
        ) : null}
      </div>
    </div>
  );
}
