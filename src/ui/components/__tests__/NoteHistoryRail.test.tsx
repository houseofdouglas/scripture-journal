// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockUseUserIndex = vi.fn();
const mockUseProjects = vi.fn();

vi.mock("../../lib/queries/user-index", () => ({ useUserIndex: () => mockUseUserIndex() }));
vi.mock("../../lib/queries/projects", () => ({ useProjects: () => mockUseProjects() }));

import { NoteHistoryRail } from "../NoteHistoryRail";

function entry(overrides: Record<string, unknown> = {}) {
  return {
    entryId: "id-1",
    date: "2026-08-12",
    contentRef: "content/scripture/book-of-mormon/alma/32.json",
    contentTitle: "Alma 32",
    contentType: "scripture",
    projectId: "personal",
    snippet: "A note about faith and hope.",
    noteCount: 2,
    ...overrides,
  };
}

const CONTENT_REF = "content/scripture/book-of-mormon/alma/32.json";

function loaded(entries: unknown[]) {
  mockUseUserIndex.mockReturnValue({ data: { entries }, isLoading: false, isError: false, refetch: vi.fn() });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseProjects.mockReturnValue({ data: [] });
});

afterEach(() => cleanup());

describe("NoteHistoryRail", () => {
  it("renders the header and one row per past entry, newest first", () => {
    loaded([
      entry({ entryId: "oldest", date: "2026-06-01" }),
      entry({ entryId: "newest", date: "2026-08-10" }),
    ]);

    render(<NoteHistoryRail contentRef={CONTENT_REF} contentType="scripture" onOpenEntry={vi.fn()} />);

    const buttons = screen.getAllByRole("button", { name: /faith and hope/i });
    expect(buttons).toHaveLength(2);
    expect(screen.getAllByText(/Past notes/)[0]).toBeTruthy();
  });

  it("caps at 8 rows and reveals the rest via Show all", async () => {
    const user = userEvent.setup();
    loaded(Array.from({ length: 12 }, (_, i) => entry({ entryId: `e${i}`, date: `2026-01-${String(i + 1).padStart(2, "0")}` })));

    render(<NoteHistoryRail contentRef={CONTENT_REF} contentType="scripture" onOpenEntry={vi.fn()} />);

    expect(screen.getAllByText(/A note about faith and hope\./)).toHaveLength(8);
    await user.click(screen.getByRole("button", { name: /show all 12/i }));
    expect(screen.getAllByText(/A note about faith and hope\./)).toHaveLength(12);
  });

  it("shows no project badge with a single project", () => {
    loaded([entry()]);
    mockUseProjects.mockReturnValue({ data: [{ projectId: "personal", name: "Personal" }] });

    render(<NoteHistoryRail contentRef={CONTENT_REF} contentType="scripture" onOpenEntry={vi.fn()} />);

    expect(screen.queryByText("Personal")).toBeNull();
  });

  it("shows the project name badge with more than one project", () => {
    loaded([entry({ projectId: "work" })]);
    mockUseProjects.mockReturnValue({
      data: [
        { projectId: "personal", name: "Personal" },
        { projectId: "work", name: "Work" },
      ],
    });

    render(<NoteHistoryRail contentRef={CONTENT_REF} contentType="scripture" onOpenEntry={vi.fn()} />);

    expect(screen.getAllByText("Work").length).toBeGreaterThan(0);
  });

  it("shows a skeleton while loading", () => {
    mockUseUserIndex.mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() });

    const { container } = render(
      <NoteHistoryRail contentRef={CONTENT_REF} contentType="scripture" onOpenEntry={vi.fn()} />
    );

    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });

  it("shows an error message with a working Retry", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    mockUseUserIndex.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });

    render(<NoteHistoryRail contentRef={CONTENT_REF} contentType="scripture" onOpenEntry={vi.fn()} />);

    expect(screen.getAllByText(/couldn't load note history/i)[0]).toBeTruthy();
    await user.click(screen.getAllByRole("button", { name: /retry/i })[0]!);
    expect(refetch).toHaveBeenCalled();
  });

  it("shows the muted empty message for scripture and renders no mobile disclosure", () => {
    loaded([]);

    render(<NoteHistoryRail contentRef={CONTENT_REF} contentType="scripture" onOpenEntry={vi.fn()} />);

    expect(screen.getByText("No past notes on this chapter.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /past note/i })).toBeNull();
  });

  it("shows the muted empty message for articles", () => {
    loaded([]);

    render(<NoteHistoryRail contentRef={CONTENT_REF} contentType="article" onOpenEntry={vi.fn()} />);

    expect(screen.getByText("No past notes on this article.")).toBeTruthy();
  });

  it("calls onOpenEntry with the entryId when a row is clicked", async () => {
    const user = userEvent.setup();
    const onOpenEntry = vi.fn();
    loaded([entry({ entryId: "e42" })]);

    render(<NoteHistoryRail contentRef={CONTENT_REF} contentType="scripture" onOpenEntry={onOpenEntry} />);

    await user.click(screen.getAllByRole("button", { name: /faith and hope/i })[0]!);
    expect(onOpenEntry).toHaveBeenCalledWith("e42");
  });

  it("toggles the mobile disclosure's aria-expanded and reveals rows", async () => {
    const user = userEvent.setup();
    loaded([entry()]);

    render(<NoteHistoryRail contentRef={CONTENT_REF} contentType="scripture" onOpenEntry={vi.fn()} />);

    const disclosure = screen.getByRole("button", { name: /past note/i });
    expect(disclosure.getAttribute("aria-expanded")).toBe("false");

    await user.click(disclosure);
    expect(disclosure.getAttribute("aria-expanded")).toBe("true");
  });
});
