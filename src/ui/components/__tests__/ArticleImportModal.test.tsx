// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

afterEach(cleanup);

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("../../lib/pdf-extract-client", () => ({
  extractPdfWithFallback: vi.fn(),
}));

vi.mock("../../lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api-client")>("../../lib/api-client");
  return { ...actual, apiClient: { post: vi.fn(), get: vi.fn() } };
});

import * as pdfExtractClient from "../../lib/pdf-extract-client";
import * as apiClientModule from "../../lib/api-client";
import { ArticleImportModal } from "../ArticleImportModal";

const mockExtractPdfWithFallback = vi.mocked(pdfExtractClient.extractPdfWithFallback);
const mockPost = vi.mocked(apiClientModule.apiClient.post);

const FAKE_FILE = new File(["%PDF-fake"], "my-report.pdf", { type: "application/pdf" });

function renderModal() {
  return render(
    <MemoryRouter>
      <ArticleImportModal onClose={vi.fn()} />
    </MemoryRouter>
  );
}

async function goToPdfMode() {
  await userEvent.click(screen.getByText("Import a PDF →"));
}

describe("ArticleImportModal — PDF preview flow", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows an extracting state, then the preview with the suggested title and paragraphs", async () => {
    let resolveExtract!: (value: Awaited<ReturnType<typeof mockExtractPdfWithFallback>>) => void;
    mockExtractPdfWithFallback.mockReturnValue(new Promise((resolve) => (resolveExtract = resolve)));

    renderModal();
    await goToPdfMode();

    const fileInput = screen.getByLabelText("PDF file");
    await userEvent.upload(fileInput, FAKE_FILE);

    expect(screen.getByText("Extracting text…")).toBeTruthy();

    resolveExtract({
      paragraphs: ["First paragraph.", "Second paragraph."],
      suggestedTitle: "My Article Title",
      source: "cloud",
    });

    await waitFor(() => expect(screen.getByDisplayValue("My Article Title")).toBeTruthy());
    expect(screen.getByText("First paragraph.")).toBeTruthy();
    expect(screen.getByText("Second paragraph.")).toBeTruthy();
    expect(screen.queryByText(/Cloud extraction unavailable/)).toBeNull();
  });

  it("falls back to a filename-derived title and shows the fallback notice when source is local", async () => {
    mockExtractPdfWithFallback.mockResolvedValue({
      paragraphs: ["Some text."],
      suggestedTitle: null,
      source: "local",
    });

    renderModal();
    await goToPdfMode();
    await userEvent.upload(screen.getByLabelText("PDF file"), FAKE_FILE);

    await waitFor(() => expect(screen.getByDisplayValue("my report")).toBeTruthy());
    expect(screen.getByText(/Cloud extraction unavailable — used local extraction\./)).toBeTruthy();
  });

  it("shows an error and stays on the file picker when extraction yields no paragraphs", async () => {
    mockExtractPdfWithFallback.mockResolvedValue({ paragraphs: [], suggestedTitle: null, source: "cloud" });

    renderModal();
    await goToPdfMode();
    await userEvent.upload(screen.getByLabelText("PDF file"), FAKE_FILE);

    await waitFor(() => expect(screen.getByText("Could not extract text from this PDF.")).toBeTruthy());
    expect(screen.queryByText(/Preview \(/)).toBeNull();
  });

  it("cancelling the preview creates no article and returns to the URL step", async () => {
    mockExtractPdfWithFallback.mockResolvedValue({
      paragraphs: ["Text."],
      suggestedTitle: "Title",
      source: "cloud",
    });

    renderModal();
    await goToPdfMode();
    await userEvent.upload(screen.getByLabelText("PDF file"), FAKE_FILE);
    await waitFor(() => expect(screen.getByText(/Preview \(/)).toBeTruthy());

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mockPost).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Article URL")).toBeTruthy();
  });

  it("confirming the preview imports the joined paragraphs under the edited title", async () => {
    mockExtractPdfWithFallback.mockResolvedValue({
      paragraphs: ["Para one.", "Para two."],
      suggestedTitle: "Original Title",
      source: "cloud",
    });
    mockPost.mockResolvedValue({ status: "IMPORTED", articleId: "a".repeat(64), title: "Edited Title", importedAt: "2026-01-01T00:00:00Z" });

    renderModal();
    await goToPdfMode();
    await userEvent.upload(screen.getByLabelText("PDF file"), FAKE_FILE);
    await waitFor(() => expect(screen.getByDisplayValue("Original Title")).toBeTruthy());

    const titleInput = screen.getByLabelText("Title");
    fireEvent.change(titleInput, { target: { value: "Edited Title" } });
    await userEvent.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith("/articles/import", {
        text: "Para one.\n\nPara two.",
        title: "Edited Title",
      })
    );
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(`/articles/${"a".repeat(64)}`));
  });
});
