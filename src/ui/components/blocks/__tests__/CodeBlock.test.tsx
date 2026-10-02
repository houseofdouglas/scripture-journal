// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { CodeBlock, COPY_STATUS_MS } from "../CodeBlock";
import { TRUNCATION_NOTES } from "../TruncationNote";

const XSS = "<script>alert(1)</script>";
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");

function mockClipboard(writeText: ((text: string) => Promise<void>) | undefined) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: writeText ? { writeText } : undefined,
  });
}

/** Click Copy and flush the clipboard promise so the status update lands. */
async function clickCopy() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button"));
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
  else delete (navigator as { clipboard?: unknown }).clipboard;
});

describe("CodeBlock", () => {
  it("renders content in <pre><code> with no-wrap horizontal scroll", () => {
    const { container } = render(<CodeBlock code={{ language: null, content: "const x = 1;" }} />);
    const pre = container.querySelector("pre");
    expect(pre).not.toBeNull();
    expect(pre!.querySelector("code")!.textContent).toBe("const x = 1;");
    expect(pre!.className).toContain("whitespace-pre");
    expect(pre!.className).toContain("overflow-x-auto");
    expect(pre!.className).toContain("font-mono");
  });

  it("copies the exact content, including leading whitespace, tabs, and newlines", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    mockClipboard(writeText);
    const content = "\n  \tindented()\n\t\tdeeper\n\n  trailing  \n";
    render(<CodeBlock code={{ language: "ts", content }} />);
    await clickCopy();
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(content);
  });

  it('shows "Copied" in the button and live region, then reverts after 2 s', async () => {
    mockClipboard(vi.fn().mockResolvedValue(undefined));
    render(<CodeBlock code={{ language: null, content: "x" }} />);
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(screen.getByRole("button").textContent).toBe("Copy");

    await clickCopy();
    expect(screen.getByRole("button").textContent).toBe("Copied");
    expect(status.textContent).toBe("Copied");

    act(() => {
      vi.advanceTimersByTime(COPY_STATUS_MS - 1);
    });
    expect(screen.getByRole("button").textContent).toBe("Copied");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole("button").textContent).toBe("Copy");
    expect(status.textContent).toBe("");
  });

  it('shows "Copy failed" when the clipboard rejects', async () => {
    mockClipboard(vi.fn().mockRejectedValue(new DOMException("denied", "NotAllowedError")));
    render(<CodeBlock code={{ language: null, content: "x" }} />);
    await clickCopy();
    expect(screen.getByRole("button").textContent).toBe("Copy failed");
    expect(screen.getByRole("status").textContent).toBe("Copy failed");
  });

  it('shows "Copy failed" when the clipboard API is absent', async () => {
    mockClipboard(undefined);
    render(<CodeBlock code={{ language: null, content: "x" }} />);
    await clickCopy();
    expect(screen.getByRole("button").textContent).toBe("Copy failed");
  });

  it("clears its timer on unmount", async () => {
    mockClipboard(vi.fn().mockResolvedValue(undefined));
    const { unmount } = render(<CodeBlock code={{ language: null, content: "x" }} />);
    await clickCopy();
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("renders no language label when language is null", () => {
    render(<CodeBlock code={{ language: null, content: "x" }} />);
    expect(screen.queryByTestId("code-language")).toBeNull();
  });

  it("renders the language label when language is set", () => {
    render(<CodeBlock code={{ language: "python", content: "x" }} />);
    expect(screen.getByTestId("code-language").textContent).toBe("python");
  });

  it("renders a script string literally", () => {
    const { container } = render(<CodeBlock code={{ language: null, content: XSS }} />);
    expect(container.querySelector("code")!.textContent).toBe(XSS);
    expect(container.querySelector("script")).toBeNull();
  });

  it("shows the truncation note only when truncated", () => {
    render(<CodeBlock code={{ language: null, content: "x", truncated: true }} />);
    expect(screen.getByText(TRUNCATION_NOTES.code)).toBeTruthy();
    cleanup();
    render(<CodeBlock code={{ language: null, content: "x" }} />);
    expect(screen.queryByText(TRUNCATION_NOTES.code)).toBeNull();
  });
});
