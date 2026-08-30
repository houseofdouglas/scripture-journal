// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const mockUseJournalEntry = vi.fn();
const mockUseProjects = vi.fn();
const mockScrollToBlock = vi.fn();

vi.mock("../../lib/queries/entry", () => ({ useJournalEntry: () => mockUseJournalEntry() }));
vi.mock("../../lib/queries/projects", () => ({ useProjects: () => mockUseProjects() }));
vi.mock("../../lib/block-scroll", () => ({ scrollToBlock: (...args: unknown[]) => mockScrollToBlock(...args) }));

import { NoteHistoryModal } from "../NoteHistoryModal";

const ENTRY_ID = "2026-04-15_874b693ab03e34da";

const ENTRY = {
  entryId: ENTRY_ID,
  userId: "u1",
  date: "2026-04-15",
  contentRef: "content/scripture/book-of-mormon/alma/32.json",
  contentTitle: "Alma 32",
  contentType: "scripture" as const,
  projectId: "personal",
  annotations: [
    { blockId: 12, text: "The timing here seems tied to the earlier prophecy.", createdAt: "2026-04-15T15:45:00.000Z" },
    { blockId: 20, text: "Compare with 3 Nephi.", createdAt: "2026-04-15T16:00:00.000Z" },
  ],
  updatedAt: "2026-04-15T16:00:00.000Z",
};

function renderModal(props: Partial<Parameters<typeof NoteHistoryModal>[0]> = {}) {
  const onClose = vi.fn();
  const utils = render(
    <MemoryRouter>
      <NoteHistoryModal entryId={ENTRY_ID} contentType="scripture" onClose={onClose} {...props} />
    </MemoryRouter>
  );
  return { onClose, ...utils };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseProjects.mockReturnValue({ data: [] });
  document.body.style.overflow = "";
});

afterEach(() => cleanup());

describe("NoteHistoryModal", () => {
  it("renders every annotation with block label, local time, and full text", () => {
    mockUseJournalEntry.mockReturnValue({ data: ENTRY, isLoading: false, isError: false });

    renderModal();

    expect(screen.getByText("The timing here seems tied to the earlier prophecy.")).toBeTruthy();
    expect(screen.getByText("Compare with 3 Nephi.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Verse 12" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Verse 20" })).toBeTruthy();
  });

  it("labels article blocks as ¶ N+1", () => {
    mockUseJournalEntry.mockReturnValue({
      data: { ...ENTRY, contentType: "article", annotations: [{ blockId: 3, text: "x", createdAt: ENTRY.updatedAt }] },
      isLoading: false,
      isError: false,
    });

    renderModal({ contentType: "article" });

    expect(screen.getByRole("button", { name: "¶ 4" })).toBeTruthy();
  });

  it("clicking a block label closes the modal and scrolls to the block", async () => {
    const user = userEvent.setup();
    mockUseJournalEntry.mockReturnValue({ data: ENTRY, isLoading: false, isError: false });

    const { onClose } = renderModal();
    await user.click(screen.getByRole("button", { name: "Verse 12" }));

    expect(onClose).toHaveBeenCalled();
    expect(mockScrollToBlock).toHaveBeenCalledWith("scripture", 12);
  });

  it("has dialog role, aria-modal, and is labelled by the date heading", () => {
    mockUseJournalEntry.mockReturnValue({ data: ENTRY, isLoading: false, isError: false });

    renderModal();

    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const labelId = dialog.getAttribute("aria-labelledby");
    expect(labelId).toBeTruthy();
    expect(document.getElementById(labelId!)?.textContent).toContain("April 15, 2026");
  });

  it("closes on Escape", () => {
    mockUseJournalEntry.mockReturnValue({ data: ENTRY, isLoading: false, isError: false });
    const { onClose } = renderModal();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalled();
  });

  it("closes on a backdrop click but not on a click inside the dialog", async () => {
    const user = userEvent.setup();
    mockUseJournalEntry.mockReturnValue({ data: ENTRY, isLoading: false, isError: false });
    const { onClose } = renderModal();

    await user.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole("dialog").parentElement!);
    expect(onClose).toHaveBeenCalled();
  });

  it("locks background scroll while open and restores it on close", () => {
    mockUseJournalEntry.mockReturnValue({ data: ENTRY, isLoading: false, isError: false });
    const { unmount } = renderModal();

    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("shows the error message with a working Open full entry link on failure", () => {
    mockUseJournalEntry.mockReturnValue({ data: null, isLoading: false, isError: true });

    renderModal();

    expect(screen.getByText("Couldn't load this entry.")).toBeTruthy();
    const link = screen.getByRole("link", { name: /open full entry/i });
    expect(link.getAttribute("href")).toBe(`/entries/${ENTRY_ID}`);
  });

  it("shows a skeleton while loading", () => {
    mockUseJournalEntry.mockReturnValue({ data: undefined, isLoading: true, isError: false });

    const { container } = renderModal();

    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });

  it("traps Tab focus within the dialog", () => {
    mockUseJournalEntry.mockReturnValue({ data: ENTRY, isLoading: false, isError: false });
    renderModal();

    const focusable = screen.getAllByRole("button").concat(screen.getAllByRole("link"));
    const last = focusable[focusable.length - 1]!;
    const first = focusable[0]!;

    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    first.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("moves focus into the dialog on open", () => {
    mockUseJournalEntry.mockReturnValue({ data: ENTRY, isLoading: false, isError: false });
    renderModal();

    expect(document.activeElement).toBe(screen.getByRole("dialog"));
  });

  it("returns focus to the element that was focused before the modal opened", () => {
    mockUseJournalEntry.mockReturnValue({ data: ENTRY, isLoading: false, isError: false });

    const opener = document.createElement("button");
    opener.textContent = "opener";
    document.body.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    const { unmount } = renderModal();
    expect(document.activeElement).not.toBe(opener);

    unmount();
    expect(document.activeElement).toBe(opener);

    opener.remove();
  });
});
