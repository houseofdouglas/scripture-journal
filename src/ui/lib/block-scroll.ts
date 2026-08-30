import type { ContentType } from "../../types";

const FLASH_DURATION_MS = 1500;
const FLASH_CLASS = "block-flash";
const FLASH_STATIC_CLASS = "block-flash-static";

// Tracks the pending removal timer per element so a second call on the same
// block restarts the flash instead of stacking timers (spec FR-28).
const pendingRemovals = new WeakMap<Element, ReturnType<typeof setTimeout>>();

function selectorFor(contentType: ContentType, blockId: number): string {
  return contentType === "scripture"
    ? `[data-verse="${blockId}"]`
    : `[data-paragraph-index="${blockId}"]`;
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Scrolls the DOM block for (`contentType`, `blockId`) into view and flashes
 * a highlight on it for 1.5s. Returns `false` (no-op) if the block isn't
 * currently rendered — e.g. a stale `blockId` from a since-changed content
 * version (spec FR-30).
 */
export function scrollToBlock(contentType: ContentType, blockId: number): boolean {
  const el = document.querySelector(selectorFor(contentType, blockId));
  if (!el) return false;

  const reduced = prefersReducedMotion();
  el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });

  const flashClass = reduced ? FLASH_STATIC_CLASS : FLASH_CLASS;

  const pending = pendingRemovals.get(el);
  if (pending) clearTimeout(pending);
  el.classList.remove(FLASH_CLASS, FLASH_STATIC_CLASS);
  el.classList.add(flashClass);

  const timer = setTimeout(() => {
    el.classList.remove(flashClass);
    pendingRemovals.delete(el);
  }, FLASH_DURATION_MS);
  pendingRemovals.set(el, timer);

  return true;
}
