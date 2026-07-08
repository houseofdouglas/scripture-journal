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
  sourceUrl: z.string().min(1), // URL for web imports; "pdf-import:<articleId>" for PDFs
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
  sourceUrl: z.string().min(1),
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

/** PDF mode: { text, title } — no URL; server generates a synthetic sourceUrl */
const ImportPdfModeSchema = z.object({
  text: z.string().min(1),
  title: z.string().min(1),
  url: z.undefined().optional(),
  confirm: z.undefined().optional(),
});

export const ImportRequestSchema = z.union([ImportUrlModeSchema, ImportManualModeSchema, ImportPdfModeSchema]);
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

// ── Article Index ─────────────────────────────────────────────────────────────

/**
 * One entry in the article index — enough data to render a browse card.
 * Full article content lives at content/articles/<articleId>.json.
 */
export const ArticleIndexEntrySchema = z.object({
  articleId: z.string().length(64),       // SHA-256 hex
  title: z.string().min(1),
  sourceUrl: z.string().min(1),
  importedAt: z.string().datetime(),      // ISO 8601
  archived: z.boolean().default(false),   // entries written before this field existed parse as false
});
export type ArticleIndexEntry = z.infer<typeof ArticleIndexEntrySchema>;

/**
 * S3 key: content/articles/index.json
 * One entry per source URL (latest version only). Pre-sorted newest-first.
 * Updated (with conditional write + retry) on every successful article import.
 */
export const ArticleIndexSchema = z.object({
  articles: z.array(ArticleIndexEntrySchema),
});
export type ArticleIndex = z.infer<typeof ArticleIndexSchema>;

// ── PDF Textract extraction ───────────────────────────────────────────────────

/** Matches `tmp/extract/<uuid-v4>.pdf` — the only keys the extract endpoint accepts. */
export const TMP_EXTRACT_KEY_PATTERN =
  /^tmp\/extract\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/;

/** Build the tmp S3 key for a freshly generated extraction UUID. */
export function buildExtractTmpKey(uuid: string): string {
  return `tmp/extract/${uuid}.pdf`;
}

export const ExtractUploadUrlResponseSchema = z.object({
  uploadUrl: z.string().url(),
  key: z.string().regex(TMP_EXTRACT_KEY_PATTERN),
});
export type ExtractUploadUrlResponse = z.infer<typeof ExtractUploadUrlResponseSchema>;

export const ExtractPdfRequestSchema = z.object({
  key: z.string().regex(TMP_EXTRACT_KEY_PATTERN, "Invalid extraction key"),
  filename: z.string().min(1),
});
export type ExtractPdfRequest = z.infer<typeof ExtractPdfRequestSchema>;

export const ExtractPdfResponseSchema = z.object({
  paragraphs: z.array(z.string().min(1)).min(1),
  suggestedTitle: z.string().min(1).nullable(),
  pageCount: z.number().int().positive(),
});
export type ExtractPdfResponse = z.infer<typeof ExtractPdfResponseSchema>;
