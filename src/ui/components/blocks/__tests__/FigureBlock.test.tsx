// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { FigureBlock, assetUrl } from "../FigureBlock";
import { BlockContent } from "../BlockContent";
import type { FigurePayload } from "../../../../types";

afterEach(() => cleanup());

const SHA = "a".repeat(64);

const wideSvg: FigurePayload = {
  assetKey: `content/assets/${SHA}.svg`,
  format: "svg",
  width: 2400,
  height: 600,
  alt: "AI-native SDLC diagram",
  caption: "Figure 1. The loop",
};

const raster: FigurePayload = {
  assetKey: `content/assets/${"b".repeat(64)}.png`,
  format: "png",
  width: 400,
  height: 300,
  alt: "A chart",
  caption: "",
};

const unavailable: FigurePayload = {
  assetKey: null,
  format: null,
  width: null,
  height: null,
  alt: "Broken diagram",
  caption: "Figure 2. Missing",
  unavailable: true,
};

/** Reads one declaration from the raw style attribute (jsdom's CSSOM drops some modern values). */
function styleDecl(el: HTMLElement, prop: string): string | undefined {
  const raw = el.getAttribute("style") ?? "";
  for (const part of raw.split(";")) {
    const idx = part.indexOf(":");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === prop) return part.slice(idx + 1).trim();
  }
  return undefined;
}

describe("assetUrl", () => {
  it("maps an asset key to a same-origin root path", () => {
    expect(assetUrl(`content/assets/${SHA}.svg`)).toBe(`/content/assets/${SHA}.svg`);
  });
});

describe("FigureBlock", () => {
  it("renders an <img> with src, alt, intrinsic width/height, and lazy loading", () => {
    render(<FigureBlock figure={wideSvg} text="x" />);
    const img = screen.getByRole("img", { name: "AI-native SDLC diagram" });
    expect(img.tagName).toBe("IMG");
    expect(img.getAttribute("src")).toBe(`/content/assets/${SHA}.svg`);
    expect(img.getAttribute("width")).toBe("2400");
    expect(img.getAttribute("height")).toBe("600");
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("decoding")).toBe("async");
    expect(img.closest("figure")).not.toBeNull();
  });

  it("preserves aspect ratio and never exceeds intrinsic width", () => {
    render(<FigureBlock figure={wideSvg} text="x" />);
    const img = screen.getByRole("img");
    expect(styleDecl(img, "aspect-ratio")).toBe("2400 / 600");
    expect(styleDecl(img, "width")).toBe("min(100%, 2400px)");
    expect(styleDecl(img, "height")).toBe("auto");
    expect(styleDecl(img, "display")).toBe("block");
    expect(styleDecl(img, "object-fit")).toBeUndefined();
  });

  it("caps a 400×300 raster at its intrinsic width", () => {
    render(<FigureBlock figure={raster} text="x" />);
    const img = screen.getByRole("img");
    expect(styleDecl(img, "width")).toBe("min(100%, 400px)");
    expect(styleDecl(img, "aspect-ratio")).toBe("400 / 300");
  });

  it("renders the caption in a <figcaption>", () => {
    const { container } = render(<FigureBlock figure={wideSvg} text="x" />);
    expect(container.querySelector("figcaption")?.textContent).toBe("Figure 1. The loop");
  });

  it("omits <figcaption> when the caption is empty", () => {
    const { container } = render(<FigureBlock figure={raster} text="x" />);
    expect(container.querySelector("figcaption")).toBeNull();
  });

  it("shows an 'Image unavailable' placeholder with the caption and no <img>", () => {
    const { container } = render(<FigureBlock figure={unavailable} text="x" />);
    expect(container.querySelector("img")).toBeNull();
    const placeholder = screen.getByRole("img");
    expect(placeholder.textContent).toBe("Image unavailable");
    expect(placeholder.getAttribute("aria-label")).toContain("Figure 2. Missing");
    expect(container.querySelector("figcaption")?.textContent).toBe("Figure 2. Missing");
  });

  it("labels the placeholder with the block text when caption and alt are empty", () => {
    render(<FigureBlock figure={{ ...unavailable, alt: "", caption: "" }} text="Flattened text" />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("Flattened text");
  });

  it("does not render 'View original size' unless a handler is supplied", () => {
    render(<FigureBlock figure={wideSvg} text="x" />);
    expect(screen.queryByRole("button", { name: "View original size" })).toBeNull();
  });

  it("renders 'View original size' and calls the handler when supplied", () => {
    const onViewOriginal = vi.fn();
    render(<FigureBlock figure={wideSvg} text="x" onViewOriginal={onViewOriginal} />);
    fireEvent.click(screen.getByRole("button", { name: "View original size" }));
    expect(onViewOriginal).toHaveBeenCalledOnce();
  });
});

describe("BlockContent figure dispatch", () => {
  it("renders a figure block through FigureBlock", () => {
    render(<BlockContent block={{ index: 0, text: "Figure 1. The loop", kind: "figure", figure: wideSvg }} />);
    expect(screen.getByRole("img").getAttribute("src")).toBe(`/content/assets/${SHA}.svg`);
  });
});
