import { z } from "zod";

// ── Shared ────────────────────────────────────────────────────────────────────

export const ContentTypeSchema = z.enum(["scripture", "article"]);
export type ContentType = z.infer<typeof ContentTypeSchema>;

// ── Annotation ────────────────────────────────────────────────────────────────

export const AnnotationSchema = z.object({
  blockId: z.number().int().min(0), // verse number (1-indexed, scripture) or paragraph index (0-indexed, article)
  text: z.string().min(1),
  createdAt: z.string().datetime(), // ISO 8601, server-assigned
});
export type Annotation = z.infer<typeof AnnotationSchema>;

// ── JournalEntry ──────────────────────────────────────────────────────────────

/**
 * S3 key: users/<userId>/entries/<entryId>.json
 * entryId = `${date}_${sha256(contentRef).slice(0, 16)}`
 * Append-only — annotations[] grows on every POST /entries/annotate.
 */
export const JournalEntrySchema = z.object({
  entryId: z.string().min(1),
  userId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // client-supplied local date
  contentRef: z.string().min(1),
  contentTitle: z.string().min(1),
  contentType: ContentTypeSchema,
  annotations: z.array(AnnotationSchema),
  updatedAt: z.string().datetime(),
});
export type JournalEntry = z.infer<typeof JournalEntrySchema>;

// ── UserIndex ─────────────────────────────────────────────────────────────────

export const UserIndexEntrySchema = z.object({
  entryId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  contentRef: z.string().min(1),
  contentTitle: z.string().min(1),
  contentType: ContentTypeSchema,
  snippet: z.string().max(200), // text of the first annotation, truncated to 200 chars
  noteCount: z.number().int().min(1),
});
export type UserIndexEntry = z.infer<typeof UserIndexEntrySchema>;

/**
 * S3 key: users/<userId>/index.json
 * entries[] ordered newest-first.
 * Updated on every successful annotation save.
 */
export const UserIndexSchema = z.object({
  entries: z.array(UserIndexEntrySchema),
});
export type UserIndex = z.infer<typeof UserIndexSchema>;

// ── API request / response schemas ───────────────────────────────────────────

export const AnnotateRequestSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // client's local date
  contentRef: z.string().min(1), // validated server-side against known prefixes
  contentTitle: z.string().min(1),
  contentType: ContentTypeSchema,
  blockId: z.number().int().min(0),
  text: z.string().min(1).refine((s) => s.trim().length > 0, {
    message: "Annotation text must contain at least one non-whitespace character",
  }),
});
export type AnnotateRequest = z.infer<typeof AnnotateRequestSchema>;

export const AnnotateResponseSchema = z.object({
  entryId: z.string().min(1),
  annotation: AnnotationSchema,
  noteCount: z.number().int().min(1),
});
export type AnnotateResponse = z.infer<typeof AnnotateResponseSchema>;
