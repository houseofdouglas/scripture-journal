import { z } from "zod";

// ── Work slugs ────────────────────────────────────────────────────────────────

export const WorkSlugSchema = z.enum([
  "bible-kjv",
  "book-of-mormon",
  "doctrine-and-covenants",
  "pearl-of-great-price",
]);
export type WorkSlug = z.infer<typeof WorkSlugSchema>;

// ── Chapter content ───────────────────────────────────────────────────────────

export const VerseSchema = z.object({
  number: z.number().int().positive(), // 1-indexed; used as blockId for annotation
  text: z.string().min(1),
});
export type Verse = z.infer<typeof VerseSchema>;

/**
 * S3 key: content/scripture/<work>/<book>/<chapter>.json
 * For D&C, book = "dc" and chapter = section number.
 * Immutable after initial ingestion.
 */
export const ScriptureChapterSchema = z.object({
  work: WorkSlugSchema,
  book: z.string().min(1), // kebab-case slug, e.g. "alma", "genesis", "dc"
  chapter: z.number().int().positive(), // 1-indexed (D&C: section number)
  title: z.string().min(1), // e.g. "Alma 32", "D&C 76"
  verses: z.array(VerseSchema).min(1),
});
export type ScriptureChapter = z.infer<typeof ScriptureChapterSchema>;

// ── Manifest ──────────────────────────────────────────────────────────────────

export const ManifestBookSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  chapterCount: z.number().int().positive(),
  /** Bible only — groups books under Old Testament / New Testament headers */
  group: z.enum(["old-testament", "new-testament"]).optional(),
});
export type ManifestBook = z.infer<typeof ManifestBookSchema>;

export const ManifestWorkSchema = z.object({
  slug: WorkSlugSchema,
  title: z.string().min(1),
  books: z.array(ManifestBookSchema).min(1),
});
export type ManifestWork = z.infer<typeof ManifestWorkSchema>;

/**
 * S3 key: content/scripture/manifest.json
 * Fetched once per SPA session; cached with staleTime: Infinity.
 */
export const ScriptureManifestSchema = z.object({
  works: z.array(ManifestWorkSchema).min(1),
});
export type ScriptureManifest = z.infer<typeof ScriptureManifestSchema>;

// ── Content reference helpers ─────────────────────────────────────────────────

/** Build the S3 key / contentRef for a scripture chapter */
export function scriptureContentRef(work: WorkSlug, book: string, chapter: number): string {
  return `content/scripture/${work}/${book}/${chapter}.json`;
}
