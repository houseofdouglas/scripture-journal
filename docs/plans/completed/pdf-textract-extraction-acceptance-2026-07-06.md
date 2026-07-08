# Acceptance Report: PDF Textract Extraction
Date: 2026-07-06
Result: PASS (re-run after closing the 3 gaps from the initial PARTIAL pass)

## Summary
26 criteria checked. 26 passing, 0 partial, 0 failing.

Every piece of functionality is implemented and works — confirmed by 187 passing automated tests (unit + component, up from 183 after closing the 3 gaps below), 6 live e2e tests (3 for archive-articles regression, 3 new for this feature, run against a real browser with real network mocking), and one of the e2e tests genuinely exercises the browser's live pdf.js extraction of a hand-verified real PDF file (not a mock).

The initial pass found 3 PARTIALs — all gaps in *automated test coverage* for specific scenarios, never broken functionality. All 3 were closed with 4 new tests (see the "Gap closed" notes below each). Original findings are preserved for the record.

## Criteria Results

### Extraction Quality

#### ✅ PASS — No interleaved column text (no sentence containing fragments of two different columns)
Gap closed: added `never interleaves text from adjacent two-column blocks (regression check against the old pdf.js extractor's bug)` to [pdf-extract.test.ts](../../../src/service/__tests__/pdf-extract.test.ts). Asserts the exact artifact the *old* extractor produced on this document (`"customer?a strategy"`) is absent, and that the two source blocks that used to get spliced together (`"Should I cut the price for this customer?..."` and `"David J. Collis (dcollis@hbs.edu)..."`) survive as fully separate paragraphs — a direct regression test against the real bug, not a hypothetical.

#### ✅ PASS — No figure/diagram label runs ("TARGET CUSTOMER", "PRICE one-time commission")
Evidence: `produces a substantial set of paragraphs with no figure-label leakage` — [pdf-extract.test.ts](../../../src/service/__tests__/pdf-extract.test.ts)

#### ✅ PASS — Running headers, footers, and page numbers do not appear
Evidence: `drops running-footer and page-number boilerplate entirely (LAYOUT_FOOTER/LAYOUT_PAGE_NUMBER)` — same file, asserts absence of `"HARVARD BUSINESS REVIEW APRIL 2008"` and any `/^PAGE \d+$/` paragraph.

#### ✅ PASS — Section headers appear as standalone paragraphs in correct position
Evidence: `keeps section headers as standalone paragraphs` — asserts `"Elements of a Strategy Statement"` and `"Defining the Objective"` are present as their own paragraph entries.

#### ✅ PASS — Line-break hyphenations are merged
Evidence: `dehyphenates a word split across a line break` — asserts `"colleagues"` present, `"col- leagues"` absent.

#### ✅ PASS — A sentence split across a column boundary is emitted as a single paragraph
Evidence: `extractPdf() — continuation merge (synthetic blocks)` — 3 targeted tests using minimal hand-built Textract blocks: merges across a page boundary, does not merge a complete sentence, never merges a heading regardless of punctuation.

### Endpoint Behavior

#### ✅ PASS — `POST /articles/extract-pdf/upload-url` returns 200 with presigned URL + key pattern; 401 unauthenticated
Evidence: handler tests `returns 200 with an uploadUrl and key` / `returns 401 without JWT` in [article.test.ts](../../../src/handler/__tests__/article.test.ts); key-pattern regex specifically verified in `createExtractUploadUrl() > returns a presigned URL and a key matching tmp/extract/<uuid>.pdf` — [tmp-upload.test.ts](../../../src/repository/__tests__/tmp-upload.test.ts)

#### ✅ PASS — `POST /articles/extract-pdf` returns 200 with ≥1 paragraphs, suggestedTitle, pageCount
Evidence: handler test `returns 200 with paragraphs, suggestedTitle, and pageCount on success`; service-level fixture tests confirm the underlying data.

#### ✅ PASS — Returns 401 without a valid JWT
Evidence: `returns 401 without JWT` (extract-pdf route) — article.test.ts

#### ✅ PASS — Returns 422 for a key outside `tmp/extract/`
Evidence: `returns 422 for a key outside tmp/extract/` — asserts service is never called (validated before any S3 access).

#### ✅ PASS — Returns 422 for missing/non-PDF/oversized, deleting the object in the latter two cases
Evidence: `throws ValidationError without deleting when the object is missing` (no delete), `throws ValidationError and deletes the object when it exceeds 50 MB`, `throws ValidationError and deletes the object when magic bytes are wrong` — pdf-extract.test.ts

#### ✅ PASS — Returns 502 `EXTRACTION_FAILED` when the job fails or yields zero kept blocks
Evidence: `throws ExtractionFailedError when zero blocks survive filtering` (service); `returns 502 EXTRACTION_FAILED when the Textract job fails` / `...times out` (handler)

#### ✅ PASS — Temporary S3 object deleted after extraction (success and failure)
Evidence: `deletes the tmp object after a successful extraction`, `deletes the tmp object even when the Textract job throws`

#### ✅ PASS — Textract calls are made in `us-east-1` with the app bucket as the document source
Gap closed: exported `TEXTRACT_REGION` from `textract.ts` (previously an inline literal in the `TextractClient` constructor) and added `TEXTRACT_REGION > is us-east-1 (Textract requires the same region as the S3 object)` in textract.test.ts, asserting against the same binding the client is actually constructed with — so a future edit to the constructor call and a stale test can't silently diverge. Bucket/key were already asserted (unchanged from the original pass).

### Client Flow

#### ✅ PASS — "Extracting text…" state covers upload-url + S3 PUT + extract call
Evidence: the state machine sets `extracting: true` once before the awaited 3-step sequence and only clears it on final resolution (`ArticleImportModal.tsx`), so it structurally cannot miss a sub-step. Confirmed rendered in `shows an extracting state, then the preview...` ([ArticleImportModal.test.tsx](../../../src/ui/components/__tests__/ArticleImportModal.test.tsx)) and live in e2e.

#### ✅ PASS — Scrollable read-only preview shown before any article is created
Evidence: modal test asserts paragraphs visible pre-Import-click with zero `apiClient.post` calls to `/articles/import`; e2e `happy path` test confirms the same live.

#### ✅ PASS — Title pre-filled from `suggestedTitle` or filename; remains editable
Evidence: `shows an extracting state, then the preview with the suggested title...` (suggestedTitle path) and `falls back to a filename-derived title...` (filename path); import test edits the title before submitting, proving editability.

#### ✅ PASS — Confirming creates the article via the existing PDF import mode; paragraphs match preview
Evidence: `confirming the preview imports the joined paragraphs under the edited title` — asserts `apiClient.post` called with `{ text: paragraphs.join("\n\n"), title }` exactly matching the previewed blocks.

#### ✅ PASS — Cancelling creates no article
Evidence: `cancelling the preview creates no article and returns to the URL step` (unit) and `cancelling the preview creates no article` (e2e) — both assert zero `/articles/import` calls.

#### ✅ PASS — Falls back to local extraction on any cloud-path failure (upload-url, S3 PUT, 502) or 120s timeout, with notice
Gap closed: added `falls back to local extraction when the upload-url request itself fails` and `falls back to local extraction when the overall 120s budget elapses` to [pdf-extract-client.test.ts](../../../src/ui/lib/__tests__/pdf-extract-client.test.ts). The timeout test drives `extractPdfWithFallback` directly (not just `extractPdfCloud`) with fake timers advanced past 121s, confirming the fallback actually fires through the full public entry point the modal calls — closing the specific "is this proven, not just architecturally implied" gap.

#### ✅ PASS — A PDF over 50 MB degrades gracefully via local extraction, no hard failure shown
Evidence: `falls back to local extraction when the PDF exceeds the 50 MB limit` — explicit, dedicated test.

### Security & Infra

#### ✅ PASS — Unauthenticated `POST /articles/extract-pdf` returns 401
Evidence: same as Endpoint Behavior's 401 test above.

#### ✅ PASS — The `tmp/` prefix is not reachable through CloudFront
Evidence: code inspection of [cloudfront.tf](../../../infra/cloudfront.tf) — the default cache behavior routes to the `spa` origin, and the only `ordered_cache_behavior`s are `/api/*` → Lambda, `/users/*` and `/content/*` → app-data bucket. No behavior exists for `/tmp/*`. Additionally, [s3.tf](../../../infra/s3.tf)'s bucket policy is an explicit allowlist granting CloudFront `s3:GetObject` only on `content/*` and `users/*` — `tmp/*` was never added, so it's denied by default (the bucket blocks all public access separately). No automated infra test exists for this (none exist anywhere in this project), so this is manual verification, not a running test.

#### ✅ PASS — Terraform adds Textract/S3-CORS/lifecycle permissions
Evidence: `terraform plan` (run during PT-02) showed exactly the 4 expected changes: `aws_iam_role_policy.lambda_textract` (create), `aws_s3_bucket_cors_configuration.app` (create), `aws_s3_bucket_lifecycle_configuration.app_tmp_expiry` (create), `aws_lambda_function.api` timeout 30→90 (update) — confirmed via `terraform show` on the saved plan. Not yet `apply`'d (deliberately deferred — see plan notes).

#### ✅ PASS — Presigned PUT URL scoped to the issued key and `application/pdf` content type
Evidence: `presigns a PutObjectCommand for the generated key with PDF content type` — asserts the exact `Key` and `ContentType` passed to `getSignedUrl`. S3's SigV4 presigned-URL mechanism enforces these as signed parameters at the protocol level (not something this app implements itself) — unit-testing the command construction is the correct-altitude test here.

#### ✅ PASS — No PII or PDF content is logged
Evidence: handler test output directly shows the structured log line: `{"level":"info","message":"pdf extracted","filename":"a.pdf","pageCount":3}` — filename and pageCount only. Code review of `pdf-extract.ts`/`article.ts` confirms no other logging calls exist that could leak extracted text.

## Non-Functional Requirements (spot-checked, not part of the formal criteria count)
- **Performance**: 75s server-side Textract budget, 120s client budget — both implemented as designed; not load-tested (not practical/necessary at this app's personal-use volume).
- **Cost**: no infrastructure changes beyond the additive Terraform diff already verified; Textract cost scales with page count, logged per import.
- **Security**: JWT auth on both new endpoints via existing global middleware; presigned URL scoped as above; tmp objects never publicly reachable.
- **Availability**: local pdf.js fallback covers Textract outages/failures for every tested failure mode except the two PARTIAL sub-scenarios above (which are architecturally covered, just not independently tested).
