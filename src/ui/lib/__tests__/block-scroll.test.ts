// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { scrollToBlock } from "../block-scroll";

function mockMatchMedia(reduced: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: reduced && query === "(prefers-reduced-motion: reduce)",
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
}

beforeEach(() => {
  document.body.innerHTML = "";
  Element.prototype.scrollIntoView = vi.fn();
  mockMatchMedia(false);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("scrollToBlock()", () => {
  it("scrolls a present scripture block into view smoothly and returns true", () => {
    const li = document.createElement("li");
    li.setAttribute("data-verse", "12");
    document.body.appendChild(li);

    const result = scrollToBlock("scripture", 12);

    expect(result).toBe(true);
    expect(li.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
  });

  it("resolves article blocks via data-paragraph-index", () => {
    const div = document.createElement("div");
    div.setAttribute("data-paragraph-index", "3");
    document.body.appendChild(div);

    expect(scrollToBlock("article", 3)).toBe(true);
    expect(div.scrollIntoView).toHaveBeenCalled();
  });

  it("returns false and does not throw for an absent block", () => {
    expect(() => {
      expect(scrollToBlock("scripture", 999)).toBe(false);
    }).not.toThrow();
  });

  it("adds a flash class, then removes it after 1.5s leaving className unchanged", () => {
    const li = document.createElement("li");
    li.className = "group flex gap-3";
    li.setAttribute("data-verse", "1");
    document.body.appendChild(li);
    const original = li.className;

    scrollToBlock("scripture", 1);
    expect(li.classList.contains("block-flash")).toBe(true);

    vi.advanceTimersByTime(1500);
    expect(li.classList.contains("block-flash")).toBe(false);
    expect(li.className).toBe(original);
  });

  it("restarts the flash on a second call instead of stacking timers", () => {
    const li = document.createElement("li");
    li.setAttribute("data-verse", "1");
    document.body.appendChild(li);

    scrollToBlock("scripture", 1);
    vi.advanceTimersByTime(700);
    scrollToBlock("scripture", 1); // restarts the 1.5s window

    // 1500ms after the FIRST call (800ms after the second) — the old timer
    // must have been cancelled, so the flash should still be present.
    vi.advanceTimersByTime(800);
    expect(li.classList.contains("block-flash")).toBe(true);

    // 1500ms after the SECOND call — now it clears, exactly once.
    vi.advanceTimersByTime(700);
    expect(li.classList.contains("block-flash")).toBe(false);
  });

  it("uses instant scroll and the static class under prefers-reduced-motion", () => {
    mockMatchMedia(true);
    const li = document.createElement("li");
    li.setAttribute("data-verse", "1");
    document.body.appendChild(li);

    scrollToBlock("scripture", 1);

    expect(li.scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "center" });
    expect(li.classList.contains("block-flash-static")).toBe(true);
    expect(li.classList.contains("block-flash")).toBe(false);
  });
});
