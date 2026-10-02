// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ParagraphList } from "../ParagraphList";
import type { ArticleParagraph } from "../../../types";

afterEach(() => cleanup());

function annotationProps(overrides: Record<string, unknown> = {}) {
  return {
    openBlockId: null,
    editorText: "",
    isSaving: false,
    errorMessage: null,
    savedAnnotations: [],
    onOpen: vi.fn(),
    onClose: vi.fn(),
    onTextChange: vi.fn(),
    onSave: vi.fn(),
    ...overrides,
  };
}

const blocks: ArticleParagraph[] = [
  { index: 0, text: "Plain paragraph." },
  { index: 1, text: "Section", kind: "heading", heading: { level: 3 } },
  { index: 2, text: "a\nb", kind: "list", list: { ordered: true, start: 5, items: [{ text: "a" }, { text: "b" }] } },
  { index: 3, text: "H | 1", kind: "table", table: { headers: ["H"], rows: [["1"]] } },
  { index: 4, text: "x = 1", kind: "code", code: { language: null, content: "x = 1" } },
  {
    index: 5,
    text: "A caption",
    kind: "figure",
    figure: { assetKey: null, format: null, width: null, height: null, alt: "", caption: "A caption", unavailable: true },
  },
];

describe("ParagraphList", () => {
  it("renders text blocks (kind absent or 'text') as a <p>", () => {
    const { container } = render(
      <ParagraphList paragraphs={[{ index: 0, text: "One." }, { index: 1, text: "Two.", kind: "text" }]} />
    );
    const ps = container.querySelectorAll("[data-paragraph-index] p");
    expect(Array.from(ps).map((p) => p.textContent)).toEqual(["One.", "Two."]);
  });

  it("dispatches each kind to its semantic element", () => {
    const { container } = render(<ParagraphList paragraphs={blocks} />);
    const block = (i: number) => container.querySelector(`[data-paragraph-index="${i}"]`)!;
    expect(block(0).querySelector("p")?.textContent).toBe("Plain paragraph.");
    expect(block(1).querySelector("h3")?.textContent).toBe("Section");
    expect(block(2).querySelector("ol")?.getAttribute("start")).toBe("5");
    expect(block(3).querySelector("table")).not.toBeNull();
    expect(block(4).querySelector("pre")?.textContent).toBe("x = 1");
    expect(block(5).textContent).toContain("A caption");
  });

  it("falls back to plain text when a payload is missing", () => {
    const { container } = render(<ParagraphList paragraphs={[{ index: 0, text: "Orphan", kind: "heading" }]} />);
    expect(container.querySelector("h2, h3, h4, h5, h6")).toBeNull();
    expect(container.querySelector("p")?.textContent).toBe("Orphan");
  });

  it("shows the '+' affordance on every block, including non-text blocks", async () => {
    const user = userEvent.setup();
    const annotation = annotationProps();
    render(<ParagraphList paragraphs={blocks} annotation={annotation} />);
    const buttons = screen.getAllByRole("button", { name: "Add note" });
    expect(buttons).toHaveLength(blocks.length);
    await user.click(buttons[3]!);
    expect(annotation.onOpen).toHaveBeenCalledWith(3);
  });

  it("shows saved annotations under a non-text block", () => {
    const annotation = annotationProps({
      savedAnnotations: [{ blockId: 1, text: "Note on heading", createdAt: "2026-09-30T12:00:00.000Z" }],
    });
    const { container } = render(<ParagraphList paragraphs={blocks} annotation={annotation} />);
    expect(container.querySelector('[data-paragraph-index="1"]')!.textContent).toContain("Note on heading");
  });
});
