// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { FigureViewerModal } from "../FigureViewerModal";
import { FigureWithOriginal, SCALED_THRESHOLD, isScaledDown } from "../blocks/FigureWithOriginal";
import type { FigurePayload } from "../../../types";

const SHA = "a".repeat(64);
const SRC = `/content/assets/${SHA}.svg`;

const wide: FigurePayload = {
  assetKey: `content/assets/${SHA}.svg`,
  format: "svg",
  width: 2400,
  height: 600,
  alt: "AI-native SDLC diagram",
  caption: "Figure 1. The loop",
};

const small: FigurePayload = {
  assetKey: `content/assets/${"b".repeat(64)}.png`,
  format: "png",
  width: 400,
  height: 300,
  alt: "A chart",
  caption: "Figure 2. Chart",
};

const unavailable: FigurePayload = {
  assetKey: null,
  format: null,
  width: null,
  height: null,
  alt: "Broken",
  caption: "Figure 3. Missing",
  unavailable: true,
};

// ── ResizeObserver mock ───────────────────────────────────────────────────────

class MockResizeObserver {
  static instances: MockResizeObserver[] = [];
  targets: Element[] = [];
  constructor(private readonly callback: ResizeObserverCallback) {
    MockResizeObserver.instances.push(this);
  }
  observe(target: Element) {
    this.targets.push(target);
  }
  unobserve() {}
  disconnect() {
    this.targets = [];
  }
  fire(width: number) {
    const entries = this.targets.map(
      (target) => ({ target, contentRect: { width } as DOMRectReadOnly }) as ResizeObserverEntry,
    );
    this.callback(entries, this);
  }
}

function resizeTo(width: number) {
  act(() => {
    for (const ro of MockResizeObserver.instances) ro.fire(width);
  });
}

const triggerName = /View original size/;

describe("FigureWithOriginal", () => {
  beforeEach(() => {
    MockResizeObserver.instances = [];
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("exports the 75% threshold", () => {
    expect(SCALED_THRESHOLD).toBe(0.75);
    expect(isScaledDown(299, 400)).toBe(true);
    expect(isScaledDown(300, 400)).toBe(false);
    expect(isScaledDown(0, 400)).toBe(false);
  });

  it("shows the trigger for a 2400 px image rendered at 343 px", () => {
    render(<FigureWithOriginal figure={wide} text="x" />);
    expect(screen.queryByRole("button", { name: triggerName })).toBeNull();
    resizeTo(343);
    expect(screen.getByRole("button", { name: "View original size: Figure 1. The loop" })).toBeTruthy();
  });

  it("hides the trigger for a 400 px image rendered at 400 px", () => {
    render(<FigureWithOriginal figure={small} text="x" />);
    resizeTo(400);
    expect(screen.queryByRole("button", { name: triggerName })).toBeNull();
  });

  it("re-evaluates on resize (400 → 200 shows the trigger, back to 400 hides it)", () => {
    render(<FigureWithOriginal figure={small} text="x" />);
    resizeTo(400);
    expect(screen.queryByRole("button", { name: triggerName })).toBeNull();
    resizeTo(200);
    expect(screen.getByRole("button", { name: triggerName })).toBeTruthy();
    resizeTo(400);
    expect(screen.queryByRole("button", { name: triggerName })).toBeNull();
  });

  it("never offers the trigger for an unavailable figure", () => {
    render(<FigureWithOriginal figure={unavailable} text="x" />);
    resizeTo(10);
    expect(screen.queryByRole("button", { name: triggerName })).toBeNull();
  });

  it("shows no trigger when ResizeObserver is unavailable", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    render(<FigureWithOriginal figure={wide} text="x" />);
    expect(screen.queryByRole("button", { name: triggerName })).toBeNull();
    expect(screen.getByRole("img").getAttribute("src")).toBe(SRC);
  });

  it("opens the modal at intrinsic size; Esc closes it and focus returns to the trigger", () => {
    render(<FigureWithOriginal figure={wide} text="x" />);
    resizeTo(343);
    const trigger = screen.getByRole("button", { name: triggerName });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);
    const modalImg = dialog.querySelector("img")!;
    expect(modalImg.style.width).toBe("2400px");
    expect(modalImg.style.height).toBe("600px");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: triggerName }));
  });
});

describe("FigureViewerModal", () => {
  afterEach(() => cleanup());

  function renderModal(overrides: Partial<{ caption: string; alt: string }> = {}) {
    const onClose = vi.fn();
    render(
      <FigureViewerModal
        src={SRC}
        width={2400}
        height={600}
        alt={overrides.alt ?? "AI-native SDLC diagram"}
        caption={overrides.caption ?? "Figure 1. The loop"}
        onClose={onClose}
      />,
    );
    return onClose;
  }

  it("is a modal dialog labelled by the caption", () => {
    renderModal();
    const dialog = screen.getByRole("dialog", { name: "Figure 1. The loop" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const labelId = dialog.getAttribute("aria-labelledby")!;
    expect(document.getElementById(labelId)?.textContent).toBe("Figure 1. The loop");
  });

  it("falls back to alt, then 'Figure', for the label", () => {
    renderModal({ caption: "" });
    expect(screen.getByRole("dialog", { name: "AI-native SDLC diagram" })).toBeTruthy();
    cleanup();
    renderModal({ caption: "", alt: "" });
    expect(screen.getByRole("dialog", { name: "Figure" })).toBeTruthy();
  });

  it("renders the image at exactly intrinsic CSS px with no max-width, in a two-axis scroller", () => {
    renderModal();
    const img = screen.getByRole("dialog").querySelector("img")!;
    expect(img.getAttribute("src")).toBe(SRC);
    expect(img.style.width).toBe("2400px");
    expect(img.style.height).toBe("600px");
    expect(img.style.maxWidth).toBe("none");
    const scroller = screen.getByTestId("figure-viewer-scroll");
    expect(scroller.className).toContain("overflow-auto");
    expect(scroller.scrollLeft).toBe(0);
    expect(scroller.scrollTop).toBe(0);
  });

  it("links to the asset in a new tab", () => {
    renderModal();
    const link = screen.getByRole("link", { name: "Open in new tab" });
    expect(link.getAttribute("href")).toBe(SRC);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("closes on Esc", () => {
    const onClose = renderModal();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes on the close button", () => {
    const onClose = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes on backdrop click but not on clicks inside the content", () => {
    const onClose = renderModal();
    fireEvent.click(screen.getByRole("dialog").querySelector("img")!);
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("figure-viewer-backdrop"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("traps Tab focus within the dialog", () => {
    renderModal();
    const link = screen.getByRole("link", { name: "Open in new tab" });
    const close = screen.getByRole("button", { name: "Close" });
    close.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(link);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(close);
  });

  it("locks body scroll while open and restores it on unmount", () => {
    document.body.style.overflow = "";
    const { unmount } = render(
      <FigureViewerModal src={SRC} width={10} height={10} alt="" caption="c" onClose={() => {}} />,
    );
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });
});
