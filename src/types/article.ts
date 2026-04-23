import { z } from "zod";

// ── Article ───────────────────────────────────────────────────────────────────

export const ArticleParagraphSchema = z.object({
  index: z.number().int().min(0), // 0-indexed; used as blockId for annotation
  text: z.string().min(1),
});
export type ArticleParagraph = z.infer<typeof ArticleParagraphSchema>;

/**
 * S3 key: content/articles/<articleId>.json
 * articleId = SHA-256(plainText) lowercase hex (64 chars)
 * Immutable after initial ingestion.
 */
export const ArticleSchema = z.object({
  articleId: z.string().length(64), // SHA-256 hex
  sourceUrl: z.string().url(),
  title: z.string().min(1),
  importedAt: z.string().datetime(),
  scope: z.literal("shared"), // Phase 1: always shared
  paragraphs: z.array(ArticleParagraphSchema).min(1),
  previousVersionId: z.string().length(64).optional(), // articleId of prior version
});
export type Article = z.infer<typeof ArticleSchema>;

// ── URL index ─────────────────────────────────────────────────────────────────

export const ArticleUrlVersionSchema = z.object({
  articleId: z.string().length(64),
  importedAt: z.string().datetime(),
});
export type ArticleUrlVersion = z.infer<typeof ArticleUrlVersionSchema>;

/**
 * S3 key: content/articles/url-index/<sha256(url)>.json
 * versions[] ordered oldest → newest; last entry = current version.
 */
export const ArticleUrlIndexSchema = z.object({
  sourceUrl: z.string().url(),
  versions: z.array(ArticleUrlVersionSchema).min(1),
});
export type ArticleUrlIndex = z.infer<typeof ArticleUrlIndexSchema>;

// ── API request / response schemas ───────────────────────────────────────────

/** URL fetch mode: { url } — server fetches and parses HTML */
const ImportUrlModeSchema = z.object({
  url: z.string().url(),
  text: z.undefined().optional(),
  title: z.undefined().optional(),
  confirm: z.boolean().optional(),
});

/** Manual paste mode: { url, text, title } — skips fetch */
const ImportManualModeSchema = z.object({
  url: z.string().url(),
  text: z.string().min(1),
  title: z.string().min(1),
  confirm: z.boolean().optional(),
});

export const ImportRequestSchema = z.union([ImportUrlModeSchema, ImportManualModeSchema]);
export type ImportRequest = z.infer<typeof ImportRequestSchema>;

/** 200 — article was newly stored */
const ImportedResponseSchema = z.object({
  status: z.literal("IMPORTED"),
  articleId: z.string().length(64),
  title: z.string().min(1),
  importedAt: z.string().datetime(),
});

/** 200 — identical content already exists */
const DuplicateResponseSchema = z.object({
  status: z.literal("DUPLICATE"),
  articleId: z.string().length(64),
  title: z.string().min(1),
  importedAt: z.string().datetime(),
});

/** 200 — URL is known but content has changed; client must confirm */
const NewVersionResponseSchema = z.object({
  status: z.literal("NEW_VERSION"),
  previousArticleId: z.string().length(64),
  previousImportedAt: z.string().datetime(),
  title: z.string().min(1),
});

/** 200 — new version was stored after user confirmed */
const VersionImportedResponseSchema = z.object({
  status: z.literal("VERSION_IMPORTED"),
  articleId: z.string().length(64),
  title: z.string().min(1),
  importedAt: z.string().datetime(),
  previousArticleId: z.string().length(64),
});

export const ImportResponseSchema = z.discriminatedUnion("status", [
  ImportedResponseSchema,
  DuplicateResponseSchema,
  NewVersionResponseSchema,
  VersionImportedResponseSchema,
]);
export type ImportResponse = z.infer<typeof ImportResponseSchema>;

/** Build the contentRef for an article */
export function articleContentRef(articleId: string): string {
  return `content/articles/${articleId}.json`;
}
