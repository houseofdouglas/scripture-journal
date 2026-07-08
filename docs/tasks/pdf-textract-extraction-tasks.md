# Tasks: PDF Textract Extraction

**Spec**: [docs/specs/pdf-textract-extraction.md](../specs/pdf-textract-extraction.md)
**Created**: 2026-07-06
**Status**: PENDING

---

## Task: PT-01 — Types: extraction request/response schemas

**Layer**: Types
**Estimate**: 30min
**Depends on**: none
**Status**: DONE
**Completed**: 2026-07-06

### What to build
Add `ExtractUploadUrlResponseSchema`, `ExtractPdfRequestSchema` (with `key` regex-validated against `^tmp/extract/[0-9a-f-]{36}\.pdf$`), and `ExtractPdfResponseSchema` to `src/types/article.ts`, per the spec's Data Model. Export inferred types.

### Acceptance criteria
- [ ] `ExtractPdfRequestSchema` rejects keys outside `tmp/extract/<uuid>.pdf`
- [ ] `ExtractPdfResponseSchema` requires ≥ 1 paragraph, nullable `suggestedTitle`, integer `pageCount`
- [ ] `tsc --noEmit` passes

### Files expected
- `src/types/article.ts` — new schemas + types
- `src/types/__tests__/article.test.ts` — key-pattern and shape tests

---

## Task: PT-02 — Infra: Textract IAM, bucket CORS, tmp lifecycle, Lambda timeout

**Layer**: Infra
**Estimate**: 1hr
**Depends on**: none
**Status**: DONE
**Completed**: 2026-07-06 (`terraform plan` validated only — `apply` intentionally deferred; see plan notes)

### What to build
Terraform changes: (a) Lambda role statement for `textract:StartDocumentAnalysis` + `textract:GetDocumentAnalysis`, and `s3:PutObject`/`GetObject`/`DeleteObject` scoped to `${bucket_arn}/tmp/extract/*` (existing role in `infra/lambda.tf`); (b) `aws_s3_bucket_cors_configuration` on the app bucket allowing `PUT` from `https://${var.custom_domain}` and `http://localhost:5173`; (c) `aws_s3_bucket_lifecycle_configuration` expiring `tmp/` objects after 1 day; (d) raise `aws_lambda_function.api` timeout from 30 → 90 seconds. Also verify whether `infra/iam/deploy-policy.json` needs the Textract actions (likely not — deploys don't call Textract).

### Acceptance criteria
- [ ] `terraform plan` shows the four changes and nothing unexpected
- [ ] Lambda timeout 90s
- [ ] CORS PUT restricted to the two origins
- [ ] Lifecycle targets only the `tmp/` prefix

### Files expected
- `infra/lambda.tf` — IAM statements + timeout
- `infra/s3.tf` — CORS + lifecycle

---

## Task: PT-03 — Repository: tmp-object helpers + Textract client

**Layer**: Repository
**Estimate**: 1hr
**Depends on**: PT-01
**Status**: DONE
**Completed**: 2026-07-06

### What to build
Two small modules. `src/repository/tmp-upload.ts`: `createExtractUploadUrl()` (S3 presigned PUT via `@aws-sdk/s3-request-presigner`, 5-min expiry, `application/pdf` content type, server-generated UUID key), `headTmpObject(key)` (returns size or null), `readTmpObjectPrefix(key, bytes)` (ranged GET for magic-byte check), `deleteTmpObject(key)` (best-effort, structured log on failure). `src/repository/textract.ts`: `analyzeDocumentLayout(bucket, key)` — starts the Layout job (`FeatureTypes: ["LAYOUT"]`, us-east-1), polls every 2s within a 75s budget with throttling retries (3× backoff), paginates all result pages via `NextToken`, returns `{ blocks, pageCount }` raw. Typed errors `ExtractionFailedError` / `ExtractionTimeoutError` in `src/repository/errors.ts`. New deps: `@aws-sdk/client-textract`, `@aws-sdk/s3-request-presigner`.

### Acceptance criteria
- [ ] Presigned URL is bound to the generated key and content type
- [ ] Poll loop respects the 75s budget and retries throttling errors up to 3×
- [ ] Pagination collects all blocks across `NextToken` pages
- [ ] `tsc --noEmit` passes

### Files expected
- `src/repository/tmp-upload.ts` — new
- `src/repository/textract.ts` — new
- `src/repository/errors.ts` — new error classes
- `package.json` — new AWS SDK deps

---

## Task: PT-04 — Service: block assembly and post-processing

**Layer**: Service
**Estimate**: 2hr
**Depends on**: PT-03
**Status**: DONE
**Completed**: 2026-07-06

### What to build
New `src/service/pdf-extract.ts` with `extractPdf(key, filename)`: validates the object (exists → `ValidationError` mapped to 422; ≤ 50 MB and `%PDF-` magic bytes, deleting the object on violation); runs `analyzeDocumentLayout`; assembles paragraphs per spec FR-3/4/5/6 — keep `LAYOUT_TITLE`/`SECTION_HEADER`/`TEXT`/`LIST` in reading order (LIST joins its children), drop `HEADER`/`FOOTER`/`PAGE_NUMBER`/`FIGURE`/`TABLE`/`KEY_VALUE`; dehyphenate; merge continuation blocks (no terminal punctuation + lowercase successor); apply the repeat-across-pages boilerplate filter — extract the existing `normalizeForRepeatDetection` logic from `src/ui/lib/pdf-import.ts` into a shared util so client and server use one implementation; `suggestedTitle` = first `LAYOUT_TITLE` text or null. Deletes the tmp object on all paths. Returns `ExtractPdfResponse`; throws `ExtractionFailedError` when zero blocks survive.

### Acceptance criteria
- [ ] Reference-PDF fixture (recorded Textract blocks JSON) produces: no figure-label text, no headers/footers/page numbers, section headers standalone, "colleagues" dehyphenated, cross-column sentence merged
- [ ] Oversized / non-PDF objects raise `ValidationError` and delete the object; missing object raises `ValidationError` without delete
- [ ] Zero kept blocks raises `ExtractionFailedError`
- [ ] Tmp object deleted on success and failure paths
- [ ] `tsc --noEmit` passes

### Files expected
- `src/service/pdf-extract.ts` — new
- shared repeat-filter util (e.g. `src/lib/repeat-filter.ts` or colocated) — extracted
- `src/ui/lib/pdf-import.ts` — import the shared util

---

## Task: PT-05 — Handler: upload-url and extract-pdf routes

**Layer**: Handler
**Estimate**: 1hr
**Depends on**: PT-04
**Status**: DONE
**Completed**: 2026-07-06

### What to build
Add `POST /articles/extract-pdf/upload-url` and `POST /articles/extract-pdf` to `src/handler/article.ts`. Zod-validate the extract body; map `ValidationError` → 422, `ExtractionFailedError`/`ExtractionTimeoutError` → `502 { error: "EXTRACTION_FAILED" }`. Auth comes from the global JWT middleware. Structured logging of `{ filename, pageCount }` only — never extracted text.

### Acceptance criteria
- [ ] upload-url: 200 with `{ uploadUrl, key }`; 401 unauthenticated
- [ ] extract: 200 happy path; 401; 422 bad key/missing/oversized/non-PDF; 502 on extraction failure
- [ ] No extracted text in logs
- [ ] `tsc --noEmit` passes

### Files expected
- `src/handler/article.ts` — two new routes

---

## Task: PT-06 — Tests: backend coverage

**Layer**: Test
**Estimate**: 1.5hr
**Depends on**: PT-05
**Status**: DONE
**Completed**: 2026-07-06 (folded into PT-03/04/05 — tests written alongside each layer, plus a targeted synthetic-block continuation-merge test added to close the one gap found; see plan notes)

### What to build
Repo tests (`aws-sdk-client-mock` for S3/Textract: presign shape, poll/retry/timeout, pagination), service tests (fixture-driven assembly including the reference-PDF block fixture, validation/deletion paths), handler tests (all response codes). Written alongside PT-03–05 per workflow; this task is the completeness gate: every Endpoint Behavior and Extraction Quality criterion in the spec has at least one test.

### Acceptance criteria
- [ ] All new tests pass; no existing tests broken
- [ ] Service coverage ≥ 80%

### Files expected
- `src/repository/__tests__/textract.test.ts` — new
- `src/repository/__tests__/tmp-upload.test.ts` — new
- `src/service/__tests__/pdf-extract.test.ts` — new + fixture JSON
- `src/handler/__tests__/article.test.ts` — extended

---

## Task: PT-07 — UI: cloud extraction client with fallback

**Layer**: UI
**Estimate**: 1hr
**Depends on**: PT-05
**Status**: DONE
**Completed**: 2026-07-06 (pdf-extract-client tests written now, folding in that portion of PT-09; modal-flow tests still pending PT-08)

### What to build
New `src/ui/lib/pdf-extract-client.ts`: `extractPdfCloud(file)` orchestrates upload-url → direct S3 `PUT` (raw `fetch`, no auth header) → `POST /articles/extract-pdf`, under one 120s `AbortController` budget; returns `{ paragraphs, suggestedTitle, source: "cloud" }`. Wrapper `extractPdfWithFallback(file)` catches any cloud-path failure, runs the existing local `extractPdfText`, and returns `{ paragraphs, suggestedTitle: null, source: "local" }` so the caller can show the fallback notice. Non-PDF 422 ("File is not a valid PDF") is re-thrown, not fallen back.

### Acceptance criteria
- [ ] Happy path calls the three steps in order; abort at 120s falls back
- [ ] 502 and network errors fall back to local; invalid-PDF 422 surfaces as an error
- [ ] `tsc --noEmit` passes

### Files expected
- `src/ui/lib/pdf-extract-client.ts` — new

---

## Task: PT-08 — UI: import-modal preview step

**Layer**: UI
**Estimate**: 2hr
**Depends on**: PT-07
**Status**: DONE
**Completed**: 2026-07-06 (verified via Testing Library only, not a live browser — port 5173 conflict; see plan notes)

### What to build
Rework the PDF path in `src/ui/components/ArticleImportModal.tsx`: file select → "Extracting text…" state → preview state showing scrollable read-only paragraphs, an editable title input pre-filled from `suggestedTitle` (else filename-derived as today), the "Cloud extraction unavailable — used local extraction." notice when `source === "local"`, and Import/Cancel buttons. Import submits the previewed text through the existing `POST /articles/import` PDF mode unchanged; Cancel resets the modal, creating nothing.

### Acceptance criteria
- [ ] Preview renders before any article is created; Cancel creates nothing
- [ ] Title prefill logic (suggestedTitle → filename) and editability
- [ ] Fallback notice shown only for local-source extractions
- [ ] Imported article's paragraphs match the previewed blocks

### Files expected
- `src/ui/components/ArticleImportModal.tsx` — PDF path rework

---

## Task: PT-09 — Tests: UI unit coverage

**Layer**: Test
**Estimate**: 1hr
**Depends on**: PT-08
**Status**: DONE
**Completed**: 2026-07-06 (pdf-extract-client portion done in PT-07; modal-flow portion written alongside PT-08; see plan notes)

### What to build
Testing Library tests: `pdf-extract-client` (mocked fetch: order of calls, timeout, fallback matrix) and modal preview flow (extracting → preview → confirm/cancel, title prefill, fallback notice). Follow the `afterEach(cleanup)` + localStorage-stub conventions established in the archive-articles work.

### Acceptance criteria
- [ ] All new tests pass; no existing tests broken

### Files expected
- `src/ui/lib/__tests__/pdf-extract-client.test.ts` — new
- `src/ui/components/__tests__/ArticleImportModal.test.tsx` — new

---

## Task: PT-10 — E2E: PDF import via cloud extraction

**Layer**: Test
**Estimate**: 1hr
**Depends on**: PT-08
**Status**: DONE
**Completed**: 2026-07-06

### What to build
New `e2e/pdf-extract.spec.ts` with route mocks for upload-url, the S3 PUT (route the presigned host), and extract-pdf: happy path (choose file → preview → import → article view), fallback path (extract 502 → local extraction + notice → preview), and cancel-from-preview. Add mock helpers to `e2e/helpers/mocks.ts`.

### Acceptance criteria
- [ ] All new specs pass
- [ ] No new e2e regressions (vs. the known pre-existing failure set in article-import/article-view/change-password/past-entry specs)

### Files expected
- `e2e/pdf-extract.spec.ts` — new
- `e2e/helpers/mocks.ts` — new mock helpers
