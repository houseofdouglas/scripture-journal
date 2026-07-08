import { apiClient, ApiError } from "./api-client";
import { extractPdfText } from "./pdf-import";
import type { ExtractUploadUrlResponse, ExtractPdfResponse } from "../../types";

const CLOUD_TIMEOUT_MS = 120_000;

export type ExtractSource = "cloud" | "local";

export interface ExtractResult {
  paragraphs: string[];
  suggestedTitle: string | null;
  source: ExtractSource;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

async function uploadToS3(uploadUrl: string, file: File): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "application/pdf" },
    body: file,
  });
  if (!response.ok) {
    throw new Error(`S3 upload failed: HTTP ${response.status}`);
  }
}

/**
 * Runs the full cloud extraction path: request a presigned upload URL, PUT
 * the file directly to S3, then call the extract endpoint — all under one
 * 120s budget. Throws on any failure; callers should use
 * `extractPdfWithFallback` unless they want the raw cloud-only behavior.
 */
export async function extractPdfCloud(file: File): Promise<ExtractResult> {
  return withTimeout(
    (async (): Promise<ExtractResult> => {
      const { uploadUrl, key } = await apiClient.post<ExtractUploadUrlResponse>(
        "/articles/extract-pdf/upload-url",
        undefined
      );
      await uploadToS3(uploadUrl, file);
      const result = await apiClient.post<ExtractPdfResponse>("/articles/extract-pdf", {
        key,
        filename: file.name,
      });
      return { paragraphs: result.paragraphs, suggestedTitle: result.suggestedTitle, source: "cloud" };
    })(),
    CLOUD_TIMEOUT_MS
  );
}

/** True only for the server's "the uploaded object is not a valid PDF" 422 — local extraction would fail identically, so this is re-thrown rather than triggering a fallback. */
function isInvalidPdfError(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false;
  const body = err.body as { fields?: Record<string, string> } | null;
  return Object.values(body?.fields ?? {}).some((message) => message.includes("not a valid PDF"));
}

/**
 * Extracts PDF text via the cloud (Textract) path, falling back to the
 * local pdf.js extractor on any failure — network error, 502, oversized
 * file, or the overall 120s budget. The one exception: an invalid-PDF 422
 * is re-thrown, since local extraction would fail the same way.
 */
export async function extractPdfWithFallback(file: File): Promise<ExtractResult> {
  try {
    return await extractPdfCloud(file);
  } catch (err) {
    if (isInvalidPdfError(err)) throw err;

    const text = await extractPdfText(file);
    const paragraphs = text.split("\n\n").filter(Boolean);
    return { paragraphs, suggestedTitle: null, source: "local" };
  }
}
