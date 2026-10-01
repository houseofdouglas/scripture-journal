// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { HeadingBlock } from "../HeadingBlock";
import { ListBlock } from "../ListBlock";
import { TableBlock } from "../TableBlock";
import { TRUNCATION_NOTES } from "../TruncationNote";

const XSS = "<script>alert(1)</script>";

afterEach(() => cleanup());

describe("HeadingBlock", () => {
  it.each([2, 3, 4, 5, 6] as const)("renders level %i as <h%i>", (level) => {
    render(<HeadingBlock text="How to execute it" heading={{ level }} />);
    const h = screen.getByRole("heading", { level });
    expect(h.tagName).toBe(`H${level}`);
    expect(h.textContent).toBe("How to execute it");
  });

  it("styles levels 5 and 6 like level 4, and 2–4 distinctly", () => {
    const cls = (level: 2 | 3 | 4 | 5 | 6) => {
      const { container } = render(<HeadingBlock text="x" heading={{ level }} />);
      const c = container.firstElementChild!.className;
      cleanup();
      return c;
    };
    const [c2, c3, c4, c5, c6] = [cls(2), cls(3), cls(4), cls(5), cls(6)];
    expect(new Set([c2, c3, c4]).size).toBe(3);
    expect(c5).toBe(c4);
    expect(c6).toBe(c4);
  });

  it("renders a script string literally", () => {
    const { container } = render(<HeadingBlock text={XSS} heading={{ level: 2 }} />);
    expect(screen.getByRole("heading").textContent).toBe(XSS);
    expect(container.querySelector("script")).toBeNull();
  });
});

describe("ListBlock", () => {
  it("renders an unordered list as <ul>", () => {
    const { container } = render(
      <ListBlock list={{ ordered: false, start: 1, items: [{ text: "a" }, { text: "b" }] }} />
    );
    expect(container.querySelector("ul")).not.toBeNull();
    expect(container.querySelector("ol")).toBeNull();
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["a", "b"]);
  });

  it("renders an ordered list with start=5", () => {
    const { container } = render(<ListBlock list={{ ordered: true, start: 5, items: [{ text: "five" }] }} />);
    const ol = container.querySelector("ol");
    expect(ol).not.toBeNull();
    expect(ol!.getAttribute("start")).toBe("5");
  });

  it("renders nested items as nested lists", () => {
    const { container } = render(
      <ListBlock
        list={{
          ordered: false,
          start: 1,
          items: [{ text: "outer", children: [{ text: "middle", children: [{ text: "inner" }] }] }],
        }}
      />
    );
    const inner = container.querySelector("ul > li > ul > li > ul > li");
    expect(inner?.textContent).toBe("inner");
  });

  it("shows the truncation note only when truncated", () => {
    const { rerender } = render(<ListBlock list={{ ordered: false, start: 1, items: [{ text: "a" }] }} />);
    expect(screen.queryByText(TRUNCATION_NOTES.list)).toBeNull();
    rerender(<ListBlock list={{ ordered: false, start: 1, items: [{ text: "a" }], truncated: true }} />);
    expect(screen.getByText("List truncated (showing first 200 items)")).toBeTruthy();
  });

  it("renders a script string literally", () => {
    const { container } = render(
      <ListBlock list={{ ordered: false, start: 1, items: [{ text: XSS, children: [{ text: XSS }] }] }} />
    );
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getAllByRole("listitem")[1]!.textContent).toBe(XSS);
  });
});

describe("TableBlock", () => {
  const table = {
    headers: ["Stage", "Traditional SDLC", "AI-native SDLC"],
    rows: [
      ["Plan", "Docs", "Specs"],
      ["Build", "Code", "Agents"],
    ],
  };

  it("renders <table> with <thead> headers and body rows", () => {
    const { container } = render(<TableBlock table={table} />);
    expect(container.querySelector("table")).not.toBeNull();
    expect(screen.getAllByRole("columnheader").map((th) => th.textContent)).toEqual(table.headers);
    expect(container.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(container.querySelectorAll("tbody td")).toHaveLength(6);
  });

  it("omits <thead> when headers are empty", () => {
    const { container } = render(<TableBlock table={{ headers: [], rows: [["a", "b"]] }} />);
    expect(container.querySelector("thead")).toBeNull();
    expect(container.querySelectorAll("td")).toHaveLength(2);
  });

  it("wraps the table in a horizontally scrolling container", () => {
    render(<TableBlock table={table} />);
    const wrapper = screen.getByTestId("table-scroll");
    expect(wrapper.className).toContain("overflow-x-auto");
    expect(wrapper.querySelector("table")).not.toBeNull();
  });

  it("shows the truncation note only when truncated", () => {
    const { rerender } = render(<TableBlock table={table} />);
    expect(screen.queryByText(TRUNCATION_NOTES.table)).toBeNull();
    rerender(<TableBlock table={{ ...table, truncated: true }} />);
    expect(screen.getByText("Table truncated (showing first 50 rows / 12 columns)")).toBeTruthy();
  });

  it("renders a script string literally in headers and cells", () => {
    const { container } = render(<TableBlock table={{ headers: [XSS], rows: [[XSS]] }} />);
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByRole("columnheader").textContent).toBe(XSS);
    expect(screen.getByRole("cell").textContent).toBe(XSS);
  });
});
