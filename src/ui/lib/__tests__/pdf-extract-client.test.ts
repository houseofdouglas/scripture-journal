// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../api-client", async () => {
  const actual = await vi.importActual<typeof import("../api-client")>("../api-client");
  return { ...actual, apiClient: { post: vi.fn(), get: vi.fn() } };
});
vi.mock("../pdf-import", () => ({
  extractPdfText: vi.fn(),
}));

import * as apiClientModule from "../api-client";
import * as pdfImportModule from "../pdf-import";
import { extractPdfCloud, extractPdfWithFallback } from "../pdf-extract-client";

const mockPost = vi.mocked(apiClientModule.apiClient.post);
const mockExtractPdfText = vi.mocked(pdfImportModule.extractPdfText);
const { ApiError } = apiClientModule;

const FAKE_FILE = new File(["%PDF-fake"], "report.pdf", { type: "application/pdf" });
const UPLOAD_URL_RESPONSE = { uploadUrl: "https://bucket.s3.amazonaws.com/tmp/extract/x?sig=abc", key: "tmp/extract/x.pdf" };
const EXTRACT_RESPONSE = { paragraphs: ["First.", "Second."], suggestedTitle: "My Title", pageCount: 2 };

describe("extractPdfCloud()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("calls upload-url, then PUTs to S3, then extract-pdf, in order", async () => {
    mockPost.mockResolvedValueOnce(UPLOAD_URL_RESPONSE).mockResolvedValueOnce(EXTRACT_RESPONSE);

    const result = await extractPdfCloud(FAKE_FILE);

    expect(result).toEqual({ paragraphs: ["First.", "Second."], suggestedTitle: "My Title", source: "cloud" });
    expect(mockPost).toHaveBeenNthCalledWith(1, "/articles/extract-pdf/upload-url", undefined);
    expect(fetch).toHaveBeenCalledWith(
      UPLOAD_URL_RESPONSE.uploadUrl,
      expect.objectContaining({ method: "PUT", body: FAKE_FILE })
    );
    expect(mockPost).toHaveBeenNthCalledWith(2, "/articles/extract-pdf", { key: "tmp/extract/x.pdf", filename: "report.pdf" });
  });

  it("throws when the S3 PUT fails", async () => {
    mockPost.mockResolvedValueOnce(UPLOAD_URL_RESPONSE);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 403 })));

    await expect(extractPdfCloud(FAKE_FILE)).rejects.toThrow("S3 upload failed");
  });

  it("throws when the extract-pdf call fails", async () => {
    mockPost.mockResolvedValueOnce(UPLOAD_URL_RESPONSE).mockRejectedValueOnce(
      new ApiError(502, { error: "EXTRACTION_FAILED", message: "No text found in this PDF" })
    );

    await expect(extractPdfCloud(FAKE_FILE)).rejects.toThrow(ApiError);
  });

  it("times out after 120s and rejects", async () => {
    vi.useFakeTimers();
    mockPost.mockReturnValueOnce(new Promise(() => {})); // never resolves

    const promise = extractPdfCloud(FAKE_FILE);
    const assertion = expect(promise).rejects.toThrow("Timed out");
    await vi.advanceTimersByTimeAsync(121_000);
    await assertion;
    vi.useRealTimers();
  });
});

describe("extractPdfWithFallback()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("returns the cloud result when the cloud path succeeds", async () => {
    mockPost.mockResolvedValueOnce(UPLOAD_URL_RESPONSE).mockResolvedValueOnce(EXTRACT_RESPONSE);

    const result = await extractPdfWithFallback(FAKE_FILE);

    expect(result.source).toBe("cloud");
    expect(mockExtractPdfText).not.toHaveBeenCalled();
  });

  it("falls back to local extraction when the upload-url request itself fails", async () => {
    mockPost.mockRejectedValueOnce(new Error("network error requesting upload URL"));
    mockExtractPdfText.mockResolvedValue("Local paragraph.");

    const result = await extractPdfWithFallback(FAKE_FILE);

    expect(result).toEqual({ paragraphs: ["Local paragraph."], suggestedTitle: null, source: "local" });
    // The S3 PUT and extract-pdf steps never happen — upload-url failed first.
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it("falls back to local extraction when the overall 120s budget elapses", async () => {
    vi.useFakeTimers();
    mockPost.mockReturnValueOnce(new Promise(() => {})); // never resolves
    mockExtractPdfText.mockResolvedValue("Local paragraph after timeout.");

    const promise = extractPdfWithFallback(FAKE_FILE);
    const assertion = expect(promise).resolves.toEqual({
      paragraphs: ["Local paragraph after timeout."],
      suggestedTitle: null,
      source: "local",
    });
    await vi.advanceTimersByTimeAsync(121_000);
    await assertion;
    vi.useRealTimers();
  });

  it("falls back to local extraction on a network/S3 failure", async () => {
    mockPost.mockResolvedValueOnce(UPLOAD_URL_RESPONSE);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    mockExtractPdfText.mockResolvedValue("Local paragraph one.\n\nLocal paragraph two.");

    const result = await extractPdfWithFallback(FAKE_FILE);

    expect(result).toEqual({
      paragraphs: ["Local paragraph one.", "Local paragraph two."],
      suggestedTitle: null,
      source: "local",
    });
  });

  it("falls back to local extraction on a 502 EXTRACTION_FAILED", async () => {
    mockPost
      .mockResolvedValueOnce(UPLOAD_URL_RESPONSE)
      .mockRejectedValueOnce(new ApiError(502, { error: "EXTRACTION_FAILED", message: "job failed" }));
    mockExtractPdfText.mockResolvedValue("Fallback text.");

    const result = await extractPdfWithFallback(FAKE_FILE);

    expect(result.source).toBe("local");
  });

  it("falls back to local extraction when the PDF exceeds the 50 MB limit", async () => {
    mockPost.mockRejectedValueOnce(
      new ApiError(422, { error: "VALIDATION_ERROR", message: "PDF exceeds the 50 MB limit", fields: { key: "PDF exceeds the 50 MB limit" } })
    );
    mockExtractPdfText.mockResolvedValue("Fallback text.");

    const result = await extractPdfWithFallback(FAKE_FILE);

    expect(result.source).toBe("local");
  });

  it("re-throws (does not fall back) when the file is not a valid PDF", async () => {
    mockPost.mockRejectedValueOnce(
      new ApiError(422, { error: "VALIDATION_ERROR", message: "File is not a valid PDF", fields: { key: "File is not a valid PDF" } })
    );

    await expect(extractPdfWithFallback(FAKE_FILE)).rejects.toThrow(ApiError);
    expect(mockExtractPdfText).not.toHaveBeenCalled();
  });
});
