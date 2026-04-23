import { ScriptureChapterSchema, ScriptureManifestSchema } from "../types";
import type { ScriptureChapter, ScriptureManifest, WorkSlug } from "../types";

const CLOUDFRONT_BASE = ""; // same-origin via CloudFront /content/* path

export class DataIntegrityError extends Error {
  constructor(key: string, cause: unknown) {
    super(`Data integrity error for "${key}": ${String(cause)}`);
    this.name = "DataIntegrityError";
  }
}

async function fetchJson(url: string): Promise<unknown | null> {
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json() as Promise<unknown>;
}

/**
 * Fetch and validate the scripture manifest from CloudFront.
 * Returns null if the manifest is not yet uploaded (first run).
 */
export async function getScriptureManifest(): Promise<ScriptureManifest | null> {
  const url = `${CLOUDFRONT_BASE}/content/scripture/manifest.json`;
  const raw = await fetchJson(url);
  if (raw === null) return null;

  const result = ScriptureManifestSchema.safeParse(raw);
  if (!result.success) {
    throw new DataIntegrityError("/content/scripture/manifest.json", result.error);
  }
  return result.data;
}

/**
 * Fetch and validate a single scripture chapter from CloudFront.
 * Returns null if the chapter does not exist (404).
 */
export async function getScriptureChapter(
  work: WorkSlug,
  book: string,
  chapter: number
): Promise<ScriptureChapter | null> {
  const url = `${CLOUDFRONT_BASE}/content/scripture/${work}/${book}/${chapter}.json`;
  const raw = await fetchJson(url);
  if (raw === null) return null;

  const result = ScriptureChapterSchema.safeParse(raw);
  if (!result.success) {
    throw new DataIntegrityError(url, result.error);
  }
  return result.data;
}
