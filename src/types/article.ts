import { z } from "zod";

// ── Assets ────────────────────────────────────────────────────────────────────

/** File extensions for stored figure assets (`jpeg` format is stored as `.jpg`). */
export type AssetExt = "png" | "jpg" | "gif" | "webp" | "svg";

/** Matches `content/assets/<sha256>.<ext>` — the only keys a figure may reference. */
export const ASSET_KEY_PATTERN = /^content\/assets\/[0-9a-f]{64}\.(png|jpg|gif|webp|svg)$/;

/**
 * S3 key: content/assets/<sha256>.<ext>
 * sha = SHA-256 of the stored bytes (post-sanitization for SVG), lowercase hex.
 * Write-once, immutable, shared.
 */
export function assetKey(sha: string, ext: AssetExt): string {
  return `content/assets/${sha}.${ext}`;
}

// ── Block payloads ────────────────────────────────────────────────────────────

export const BlockKindSchema = z.enum(["text", "heading", "list", "code", "table", "figure"]);
export type BlockKind = z.infer<typeof BlockKindSchema>;

export const HeadingPayloadSchema = z.object({
  level: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]),
});
export type HeadingPayload = z.infer<typeof HeadingPayloadSchema>;

/** Maximum list nesting depth; top-level items are depth 1. */
export const MAX_LIST_DEPTH = 3;

// `| undefined` matches Zod's optional output under exactOptionalPropertyTypes.
export type ListItem = { text: string; children?: ListItem[] | undefined };

export const ListItemSchema: z.ZodType<ListItem> = z.lazy(() =>
  z.object({
    text: z.string(),
    children: z.array(ListItemSchema).optional(),
  })
);

/** Depth of the deepest item in `items`, where the items themselves are at depth 1. */
function listDepth(items: ListItem[]): number {
  let max = 0;
  for (const item of items) {
    const depth = 1 + (item.children ? listDepth(item.children) : 0);
    if (depth > max) max = depth;
  }
  return max;
}

export const ListPayloadSchema = z
  .object({
    ordered: z.boolean(),
    start: z.number().int(),
    items: z.array(ListItemSchema),
    truncated: z.boolean().optional(),
  })
  .superRefine((list, ctx) => {
    if (listDepth(list.items) > MAX_LIST_DEPTH) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `List nesting exceeds depth ${MAX_LIST_DEPTH}`,
        path: ["items"],
      });
    }
  });
export type ListPayload = z.infer<typeof ListPayloadSchema>;

export const CodePayloadSchema = z.object({
  language: z.string().nullable(),
  content: z.string(),
  truncated: z.boolean().optional(),
});
export type CodePayload = z.infer<typeof CodePayloadSchema>;

export const TablePayloadSchema = z.object({
  headers: z.array(z.string()),
  rows: z.array(z.array(z.string())),
  truncated: z.boolean().optional(),
});
export type TablePayload = z.infer<typeof TablePayloadSchema>;

/**
 * An available figure has non-null assetKey/format/width/height (positive-integer px).
 * An unavailable figure (FR-13) keeps alt/caption with the asset fields null.
 */
export const FigurePayloadSchema = z
  .object({
    assetKey: z.string().nullable(), // "content/assets/<sha256>.<ext>"
    format: z.enum(["png", "jpeg", "gif", "webp", "svg"]).nullable(),
    width: z.number().nullable(), // intrinsic px; null only when unavailable
    height: z.number().nullable(),
    alt: z.string(),
    caption: z.string(),
    unavailable: z.boolean().optional(),
  })
  .superRefine((figure, ctx) => {
    if (figure.unavailable === true) return;
    if (figure.assetKey === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "assetKey required for an available figure", path: ["assetKey"] });
    } else if (!ASSET_KEY_PATTERN.test(figure.assetKey)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid asset key", path: ["assetKey"] });
    }
    if (figure.format === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "format required for an available figure", path: ["format"] });
    }
    for (const dim of ["width", "height"] as const) {
      const value = figure[dim];
      if (value === null || !Number.isInteger(value) || value <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${dim} must be a positive integer for an available figure`,
          path: [dim],
        });
      }
    }
  });
export type FigurePayload = z.infer<typeof FigurePayloadSchema>;

// ── Article ───────────────────────────────────────────────────────────────────

const PAYLOAD_KINDS = ["heading", "list", "code", "table", "figure"] as const;

/**
 * One block of an article. `kind` absent means "text" (all pre-existing articles).
 * The payload matching `kind` is required; payloads for other kinds must be absent.
 */
export const ArticleParagraphSchema = z
  .object({
    index: z.number().int().min(0), // 0-indexed; used as blockId for annotation
    text: z.string().min(1), // flattened text for non-text kinds
    kind: BlockKindSchema.optional(), // default "text"
    heading: HeadingPayloadSchema.optional(),
    list: ListPayloadSchema.optional(),
    code: CodePayloadSchema.optional(),
    table: TablePayloadSchema.optional(),
    figure: FigurePayloadSchema.optional(),
  })
  .superRefine((block, ctx) => {
    const kind = block.kind ?? "text";
    for (const payloadKind of PAYLOAD_KINDS) {
      const present = block[payloadKind] !== undefined;
      if (payloadKind === kind && !present) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${payloadKind} payload required for kind "${kind}"`,
          path: [payloadKind],
        });
      } else if (payloadKind !== kind && present) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${payloadKind} payload not allowed for kind "${kind}"`,
          path: [payloadKind],
        });
      }
    }
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
