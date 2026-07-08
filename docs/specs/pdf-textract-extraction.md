# Spec: PDF Textract Extraction

**Status**: IMPLEMENTED
**Created**: 2026-07-06
**Last Updated**: 2026-07-06
**Related Specs**: article-import, browse-articles

---

## Overview

**Summary**: PDF imports are extracted server-side with AWS Textract's Layout analysis — which classifies blocks as body text, section headers, figures, headers/footers, and page numbers — producing accurate reading-order paragraphs and dropping non-content noise. The browser uploads the PDF directly to S3 via a presigned URL (no Lambda payload limit; PDFs up to 50 MB), the user previews the extracted paragraphs before the article is created, and the existing client-side (pdf.js) extractor remains as an automatic fallback.

**User Roles**: Reader

**Why**: The current client-side extractor infers structure from raw glyph geometry (recursive XY-cut). It handles simple layouts but has an irreducible failure tail on real documents: figure/diagram labels emitted as junk paragraphs, sidebars interrupting article flow, tables flattened to word soup, and mid-sentence paragraph breaks at column boundaries. The user's goal is a *usable* article for tracking ideas and research — annotatable, clean paragraphs. Textract Layout is a purpose-built ML layout-analysis service that classifies blocks semantically, fits the existing AWS/IAM stack with no new secrets, and costs ~$4 per 1,000 pages (≈ 4–5¢ per typical article). Validated against the 11-page two-column HBR reprint that motivated this work: 118 clean blocks (median 181 chars), all figure junk and running headers dropped by type.

---

## User Stories

- As a **Reader**, I want PDF imports to produce clean, correctly ordered paragraphs, so that the article is pleasant to read and every annotation attaches to a sensible block.
- As a **Reader**, I want figure labels, tables, running headers/footers, and page numbers excluded from the imported article, so that my reading flow isn't interrupted by layout junk.
- As a **Reader**, I want to preview the extracted paragraphs before the article is created, so that a bad extraction never becomes an article I have to archive.
- As a **Reader**, I want the import to still work (via local extraction) if the cloud extraction fails, so that I'm never blocked from importing.
- As a **Reader**, I want a sensible suggested title (from the document itself when available), so that I don't have to retype it from the filename.

---

## Functional Requirements

1. A new authenticated endpoint `POST /articles/extract-pdf/upload-url` returns a presigned S3 PUT URL (expiry 5 minutes, content type `application/pdf`) and its key (`tmp/extract/<uuid>.pdf`). The client uploads the PDF **directly to S3** via this URL — the file never passes through Lambda, so there is no request-payload ceiling.

2. A new authenticated endpoint `POST /articles/extract-pdf` accepts `{ key, filename }` for a previously uploaded PDF and returns extracted paragraphs (contract below). It does **not** create an article. The endpoint validates the key (must match `tmp/extract/<uuid>.pdf` — no client-controlled paths), verifies the object exists, checks its size (≤ 50 MB) and magic bytes (`%PDF-`, via a ranged read), starts an asynchronous Textract Layout analysis (`StartDocumentAnalysis` with `FeatureTypes: ["LAYOUT"]`), polls `GetDocumentAnalysis` until the job succeeds or fails, paginates all result blocks, and deletes the temporary object (best-effort, including on error paths).

3. Block assembly keeps, in Textract's reading order: `LAYOUT_TITLE`, `LAYOUT_SECTION_HEADER`, `LAYOUT_TEXT`, and `LAYOUT_LIST` (a list renders as one paragraph joining its items). It drops: `LAYOUT_HEADER`, `LAYOUT_FOOTER`, `LAYOUT_PAGE_NUMBER`, `LAYOUT_FIGURE`, `LAYOUT_TABLE`, and `LAYOUT_KEY_VALUE`.

4. Post-processing on the kept blocks:
   - (a) **Dehyphenation**: a line-break hyphen followed by a lowercase continuation is merged (`col- leagues` → `colleagues`).
   - (b) **Continuation merge**: a block that does not end in terminal punctuation (`.`, `!`, `?`, `:`, `"`, `”`) whose successor starts with a lowercase letter is joined with the successor into one paragraph (repairs mid-sentence splits at column/page boundaries).
   - (c) **Repeat filter**: the existing normalize-and-count boilerplate filter (paragraphs recurring on ≥ 40% of pages, min 3) is applied server-side as a safety net for repeated abstracts/watermarks that Textract classifies as body text.

5. Section headers (`LAYOUT_SECTION_HEADER`, `LAYOUT_TITLE`) each become their **own paragraph block**, annotatable like any other. No data-model change; distinct visual styling for headings is out of scope.

6. The response includes a `suggestedTitle`: the first `LAYOUT_TITLE` block's text if one exists, otherwise `null` (the client then falls back to the filename-derived title exactly as today).

7. **Client flow** (`ArticleImportModal`, PDF path): on file selection, the client requests an upload URL, PUTs the file directly to S3, then calls `POST /articles/extract-pdf` — all behind a single in-progress state ("Extracting text…"). On success, the modal shows a **preview** of the extracted paragraphs (scrollable, read-only) with the editable title field pre-filled from `suggestedTitle` (or filename). The user confirms ("Import") or cancels. Confirming submits through the **existing** `POST /articles/import` PDF mode (`{ text, title }`) unchanged — paragraphs are joined with `\n\n` exactly as the current client extractor produces.

8. **Fallback**: if any step of the cloud path fails (upload-url request, S3 PUT, or extract call — non-2xx, network error, or an overall client-side timeout of 120 seconds), the client automatically falls back to the existing local `extractPdfText` (pdf.js) and proceeds with the same preview step, showing an unobtrusive notice: "Cloud extraction unavailable — used local extraction." The local extractor is retained, unmodified.

9. The extract endpoint enforces a size cap of **50 MB** (checked via S3 object metadata, not by receiving the bytes). Oversized objects are deleted and return `422 VALIDATION_ERROR` with "PDF exceeds the 50 MB limit"; the client then uses the local-extraction fallback. Note the real cost driver is page count (~$4 per 1,000 pages), not file size — the response's `pageCount` makes the per-import cost visible in logs.

10. The extract endpoint validates the uploaded object is a PDF (magic bytes `%PDF-`, via an S3 ranged read of the first bytes); invalid objects are deleted and return `422 VALIDATION_ERROR`.

11. Server-side extraction has a total time budget of **75 seconds** (poll interval ~2s). Jobs still `IN_PROGRESS` at budget are abandoned (job left to expire; tmp object deleted) and return `504`-semantics via `502 EXTRACTION_FAILED`, triggering the client fallback.

12. **Infrastructure** (Terraform): the Lambda role gains `textract:StartDocumentAnalysis` and `textract:GetDocumentAnalysis`, plus `s3:PutObject`/`s3:GetObject`/`s3:DeleteObject` on `tmp/extract/*` (PutObject is also what authorizes generating the presigned PUT URLs). The app bucket gains a CORS rule allowing `PUT` from the CloudFront origin (and localhost for dev) so the browser can upload directly. An S3 lifecycle rule expires objects under `tmp/` after 1 day (belt-and-braces for failed deletes and abandoned uploads). The Lambda function timeout is raised to ≥ 90 seconds if currently lower (function-wide; affects all routes).

13. The `tmp/` prefix is not served by any CloudFront behavior (verify: existing behaviors cover `content/*` and `users/*` only). Temporary PDFs are never publicly reachable.

14. All Textract calls target `us-east-1` (same region as the bucket — Textract requires the S3 object to be in-region).

---

## Error States & Edge Cases

| Scenario | What Happens |
|----------|-------------|
| PDF over 50 MB | `422 { error: "VALIDATION_ERROR", message: "PDF exceeds the 50 MB limit" }`; tmp object deleted; client falls back to local extraction |
| Uploaded object is not a PDF (bad magic bytes) | `422 VALIDATION_ERROR`, "File is not a valid PDF"; tmp object deleted; shown inline in the modal (no fallback — local extraction would fail too) |
| Extract called with a key outside `tmp/extract/` or malformed | `422 VALIDATION_ERROR` — key pattern is validated before any S3 access (prevents using the endpoint to probe arbitrary bucket keys) |
| Extract called with a key that doesn't exist (upload failed or expired) | `422 VALIDATION_ERROR`, "Uploaded file not found"; client falls back to local extraction |
| Presigned URL expires before the upload finishes (slow connection, >5 min) | S3 rejects the PUT; client treats it as a cloud-path failure → local-extraction fallback |
| Textract job returns `FAILED` (corrupt/encrypted/scanned-image-only PDF) | `502 { error: "EXTRACTION_FAILED", message: "Could not extract text from this PDF" }`; client falls back to local extraction; if that also yields no text, the modal shows the existing empty-extraction error |
| Textract throttling (`ProvisionedThroughputExceededException` / `ThrottlingException`) | Retried with backoff up to 3 times within the time budget; then `502 EXTRACTION_FAILED` → client fallback |
| Extraction exceeds 75s server budget | `502 EXTRACTION_FAILED` → client fallback |
| Network failure mid-request from client | Overall client 120s timeout across the three-step flow → local-extraction fallback with notice |
| Unauthenticated request | `401 UNAUTHORIZED` (global JWT middleware) |
| Tmp S3 delete fails after extraction | Logged (structured), response unaffected; lifecycle rule expires the object within a day |
| PDF with no recognizable text blocks (pure image scan) | Textract succeeds but yields zero kept blocks → `502 EXTRACTION_FAILED` with message "No text found in this PDF" → client fallback → local also empty → existing empty-extraction error in modal |
| Document title absent (`LAYOUT_TITLE` never emitted) | `suggestedTitle: null`; client pre-fills title from filename as today |
| User cancels at the preview step | No article is created; no server state to clean up (tmp object already deleted after extraction) |
| Two concurrent extractions | Independent tmp UUID keys and Textract jobs; no shared state; both succeed |

---

## Data Model

### No changes to `Article`, `ArticleIndex`, or any stored entity

Extraction is a pure transformation step; the article is still created through the existing `POST /articles/import` PDF mode (`{ text, title }`), producing the same `Article` shape (content-addressed `articleId`, synthetic `pdf-import:<articleId>` sourceUrl).

### New Zod schemas in `src/types/article.ts`

```typescript
interface ExtractUploadUrlResponse {
  uploadUrl: string;   // presigned S3 PUT URL, 5-minute expiry, content-type application/pdf
  key: string;         // tmp/extract/<uuid>.pdf
}

interface ExtractPdfRequest {
  key: string;         // must match tmp/extract/<uuid>.pdf
  filename: string;    // original filename, for logging and title fallback context only
}

interface ExtractPdfResponse {
  paragraphs: string[];          // ordered, post-processed content blocks (≥ 1)
  suggestedTitle: string | null; // first LAYOUT_TITLE text, or null
  pageCount: number;             // from Textract DocumentMetadata
}
```

---

## API Contract

### POST `/articles/extract-pdf/upload-url`

**Auth required**: Yes
**Description**: Returns a presigned S3 PUT URL for uploading a PDF directly to the temporary extraction prefix.

**Request**: no body.

**Response — 200 OK**:
```typescript
{ uploadUrl: string; key: string }
```

**Response — 401 Unauthorized**: standard shape.

### POST `/articles/extract-pdf`

**Auth required**: Yes
**Description**: Extracts reading-order paragraphs from a previously uploaded PDF via Textract Layout. Does not create an article.

**Request**:
```typescript
// Body
{ key: string; filename: string }
```

**Response — 200 OK**:
```typescript
{ paragraphs: string[]; suggestedTitle: string | null; pageCount: number }
```

**Response — 422 Unprocessable Entity**:
```typescript
{ error: "VALIDATION_ERROR"; message: string; fields?: Record<string, string> }
// e.g. "PDF exceeds the 50 MB limit", "File is not a valid PDF", "Uploaded file not found"
```

**Response — 401 Unauthorized**:
```typescript
{ error: "UNAUTHORIZED"; message: "Missing Authorization header" }
```

**Response — 502 Bad Gateway**:
```typescript
{ error: "EXTRACTION_FAILED"; message: string }
// Textract job failed, timed out, or yielded no text — client should fall back to local extraction
```

### `POST /articles/import` — unchanged

The PDF import mode (`{ text, title }`) is untouched; the extract endpoint's output feeds it.

---

## Acceptance Criteria

### Extraction Quality (validated against the reference HBR reprint)

- [ ] Importing the reference two-column PDF produces paragraphs with no interleaved column text (no sentence containing fragments of two different columns).
- [ ] No emitted paragraph contains figure/diagram label runs (e.g. "TARGET CUSTOMER", "PRICE one-time commission" do not appear).
- [ ] Running headers, footers, and page numbers do not appear in any paragraph.
- [ ] Section headers (e.g. "Defining the Objective") appear as standalone paragraphs in correct position.
- [ ] Line-break hyphenations are merged ("colleagues", not "col- leagues").
- [ ] A sentence split across a column boundary is emitted as a single paragraph (continuation merge).

### Endpoint Behavior

- [ ] `POST /articles/extract-pdf/upload-url` returns 200 with a presigned PUT URL and a key matching `tmp/extract/<uuid>.pdf`; returns 401 without a valid JWT.
- [ ] `POST /articles/extract-pdf` returns 200 with ≥ 1 paragraphs, a `suggestedTitle`, and `pageCount` for a valid uploaded text PDF.
- [ ] Returns 401 without a valid JWT.
- [ ] Returns 422 for a key outside `tmp/extract/` (validated before any S3 access).
- [ ] Returns 422 when the uploaded object is missing, is not a PDF (wrong magic bytes), or exceeds 50 MB — deleting the object in the latter two cases.
- [ ] Returns 502 `EXTRACTION_FAILED` when the Textract job fails or yields zero kept blocks.
- [ ] The temporary S3 object is deleted after extraction (success and failure paths).
- [ ] Textract calls are made in `us-east-1` with the app bucket as the document source.

### Client Flow

- [ ] Selecting a PDF in the import modal shows an "Extracting text…" progress state covering the upload-url request, the direct S3 upload, and the extract call.
- [ ] On success, the modal shows a scrollable read-only preview of the extracted paragraphs before any article is created.
- [ ] The title field is pre-filled from `suggestedTitle` when present, otherwise from the filename; it remains editable.
- [ ] Confirming the preview creates the article via the existing `POST /articles/import` PDF mode; the resulting article's paragraphs match the previewed blocks.
- [ ] Cancelling the preview creates no article.
- [ ] When any cloud-path step fails (upload-url, S3 PUT, or extract returning 502) or the overall 120s client timeout elapses, the client falls back to local pdf.js extraction, shows the "Cloud extraction unavailable" notice, and proceeds to the same preview step.
- [ ] A PDF over 50 MB degrades gracefully: the client proceeds via local extraction without showing a hard failure to the user.

### Security & Infra

- [ ] Unauthenticated `POST /articles/extract-pdf` returns 401.
- [ ] The `tmp/` prefix is not reachable through CloudFront.
- [ ] Terraform adds Textract and scoped-S3 permissions to the Lambda role, the bucket CORS rule for direct browser PUTs, and a 1-day lifecycle expiry on `tmp/`.
- [ ] The presigned PUT URL only permits writing to the issued `tmp/extract/<uuid>.pdf` key with content-type `application/pdf`.
- [ ] No PII or PDF content is logged (filename and page count are OK; extracted text is not logged).

---

## Non-Functional Requirements

- **Performance**: extraction completes within 30s for a typical article PDF (≤ 15 pages); hard server budget 75s; overall client timeout 120s (upload of a large PDF included). The preview step makes latency visible and acceptable.
- **Cost**: Textract Layout is ~$4 per 1,000 pages → ~4–6¢ per typical article import; a 200-page document costs ~80¢. Cost scales with page count, not file size — `pageCount` is logged per import for visibility. At personal-use volume, typically under $1/month. No new persistent infrastructure.
- **Security**: auth on the endpoint via existing JWT middleware; Textract and S3 permissions scoped to the minimum (two Textract actions, `tmp/extract/*` objects); temporary PDFs never publicly served and expire within 1 day.
- **Availability**: Textract outage degrades gracefully to local extraction — imports are never blocked by the new dependency.

---

## Out of Scope

- Visual heading styling in the article view (headers are plain paragraphs for now; a `kind` field on `ArticleParagraph` is a possible future enhancement).
- Table extraction/rendering (tables are dropped; Textract's `TABLES` feature could populate a future structured representation).
- OCR for scanned/image-only PDFs (Textract can do this, but image-heavy scans change cost and quality assumptions; treated as `EXTRACTION_FAILED` → fallback for now).
- Re-extracting or migrating previously imported PDF articles (re-import manually; the old article can be archived).
- PDFs over 50 MB via the cloud path (local fallback covers them; the cap is a cost/abuse guard, not a technical limit — Textract accepts up to 500 MB and the cap is one constant if it ever needs raising).
- Editing extracted paragraphs in the preview step (preview is read-only sanity check; title is the only editable field).

---

## Open Questions

None — extractor role (Textract primary, pdf.js fallback), preview-before-save UX, and header treatment (own paragraph block) were resolved with the user before drafting. Prototype validation against the reference PDF is recorded in the Overview.
