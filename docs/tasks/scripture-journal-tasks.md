# Tasks: Scripture Journal Phase 1

**Created**: 2026-04-22
**Total tasks**: 29
**Estimated total**: ~50 hours
**Specs**: [auth](../specs/auth.md) · [scripture-browsing](../specs/scripture-browsing.md) · [article-import](../specs/article-import.md) · [annotation](../specs/annotation.md) · [dashboard](../specs/dashboard.md)

---

## Phase 1 — Foundation

---

## Task: T01 — Infra: SSM JWT secret parameter

**Layer**: Infra
**Estimate**: 30min
**Depends on**: none
**Status**: PENDING

### What to build
Add a Terraform resource for the SSM SecureString parameter that holds the JWT signing secret. The parameter is created with a placeholder value; the real secret is set manually via the AWS console or CLI after apply. This unblocks Lambda cold-start secret loading without putting the secret in source control.

### Acceptance criteria
- [ ] `infra/ssm.tf` defines `aws_ssm_parameter.jwt_secret` at path `/scripture-journal/${var.env}/jwt-secret` as type `SecureString`
- [ ] `terraform plan` shows the parameter with `lifecycle { ignore_changes = [value] }` so subsequent `terraform apply` runs don't overwrite a manually set secret
- [ ] Parameter is tagged with standard project tags

### Files expected
- `infra/ssm.tf` — SSM parameter resource

---

## Task: T02 — Infra: esbuild Lambda build pipeline

**Layer**: Infra
**Estimate**: 1hr
**Depends on**: none
**Status**: PENDING

### What to build
Create an esbuild script (`scripts/build-lambda.ts`) that bundles the Hono handler into a single Lambda-deployable ZIP. Add `npm run build:lambda` to `package.json`. The Terraform Lambda resource (T09) will reference the output ZIP path. This pipeline needs to exist before any Lambda code can be deployed.

### Acceptance criteria
- [ ] `npm run build:lambda` produces `dist/lambda.zip` containing the bundled handler
- [ ] Bundle targets Node 22, platform `node`, format `cjs`
- [ ] Source maps included (external, not inlined) for CloudWatch debugging
- [ ] Build fails loudly (non-zero exit) if TypeScript compilation errors exist

### Files expected
- `scripts/build-lambda.ts` — esbuild build script
- `package.json` — updated with `build:lambda` script

---

## Task: T03 — Types: shared Zod schemas and TypeScript interfaces

**Layer**: Types
**Estimate**: 2hr
**Depends on**: none
**Status**: PENDING

### What to build
Define all Zod schemas and derived TypeScript interfaces for every domain: auth (`UserProfile`, `UsersByName`, `JwtPayload`), scripture (`ScriptureChapter`, `ScriptureManifest`), articles (`Article`, `ArticleUrlIndex`), annotation (`JournalEntry`, `UserIndex`), and all API request/response shapes. This is the single source of type truth; all other layers import from here.

### Acceptance criteria
- [ ] Every entity from the five specs has a Zod schema and an exported `z.infer<>` TypeScript type
- [ ] All API request bodies have Zod schemas matching the spec contracts exactly
- [ ] No `any` types; `tsc --noEmit` passes with zero errors
- [ ] Schemas are co-located by domain (`src/types/auth.ts`, `src/types/article.ts`, etc.) and re-exported from `src/types/index.ts`

### Files expected
- `src/types/auth.ts` — User, UsersByName, JwtPayload, login/password/admin request schemas
- `src/types/scripture.ts` — ScriptureChapter, ScriptureManifest
- `src/types/article.ts` — Article, ArticleUrlIndex, import request/response schemas
- `src/types/annotation.ts` — JournalEntry, UserIndex, annotate request/response schemas
- `src/types/index.ts` — barrel re-export

---

## Task: T04 — Config: environment config and SSM secret loader

**Layer**: Config
**Estimate**: 1hr
**Depends on**: T03
**Status**: PENDING

### What to build
Create a config module that reads environment variables (`BUCKET_NAME`, `ENV`, `ADMIN_USERNAME`, `CLOUDFRONT_DOMAIN`) via Zod validation at startup, and a `getJwtSecret()` function that fetches the SSM SecureString on first call and caches it in module-level memory for the Lambda instance lifetime. Hard fail at cold start if config is invalid or SSM is unreachable.

### Acceptance criteria
- [ ] Missing required env var causes Lambda init to throw with a descriptive message
- [ ] `getJwtSecret()` calls SSM exactly once per Lambda instance (verified by spy in unit test)
- [ ] SSM fetch failure propagates as an unhandled rejection that kills the cold start (surfaces as 500 to caller)
- [ ] Config module exports typed constants, not raw `process.env` strings

### Files expected
- `src/config/env.ts` — Zod-validated env config
- `src/config/secrets.ts` — `getJwtSecret()` with SSM fetch + module-level cache

---

## Task: T05 — Repository: S3 client and conditional-write retry utility

**Layer**: Repository
**Estimate**: 2hr
**Depends on**: T04
**Status**: PENDING

### What to build
Create a thin S3 client wrapper and a `conditionalWrite()` utility function that encapsulates the read-modify-write pattern used throughout the app: read current object + ETag → apply transform → write with `If-Match` → on 412, retry up to 3 times with exponential backoff (100ms, 200ms, 400ms). This utility is used by auth (UsersByName), article import (ArticleUrlIndex), and annotation (JournalEntry, UserIndex).

### Acceptance criteria
- [ ] `getObject<T>()` returns `{ data: T; etag: string }` or `null` if key not found (404)
- [ ] `putObject()` accepts optional `ifMatch` and `ifNoneMatch` headers
- [ ] `conditionalWrite<T>()` retries exactly 3 times on 412 before throwing `WriteConflictError`
- [ ] Backoff delays are 100ms / 200ms / 400ms (verifiable via mock timers in tests)
- [ ] Unit tests cover: successful write, single 412 then success, 3× 412 throws `WriteConflictError`

### Files expected
- `src/repository/s3-client.ts` — typed `getObject`, `putObject`, `deleteObject`
- `src/repository/conditional-write.ts` — `conditionalWrite<T>()` utility
- `src/repository/errors.ts` — `WriteConflictError` class

---

## Phase 2 — Auth

---

## Task: T06 — Repository: auth data access

**Layer**: Repository
**Estimate**: 1hr
**Depends on**: T05
**Status**: PENDING

### What to build
Implement the four auth repository functions: `getUserByUsername()` (looks up userId in UsersByName then fetches profile), `getUserById()`, `createUser()` (writes profile.json + empty index.json + updates UsersByName via `conditionalWrite`), and `updatePasswordHash()` (overwrites profile.json with new hash). No business logic — pure S3 I/O.

### Acceptance criteria
- [ ] `getUserByUsername("Peter")` normalises to lowercase before lookup
- [ ] `createUser()` writes three S3 objects: `users/<id>/profile.json`, `users/<id>/index.json`, updates `auth/users-by-name.json` via `conditionalWrite`
- [ ] `getUserByUsername()` returns `null` for unknown usernames (no throw)
- [ ] All functions are typed against schemas from T03

### Files expected
- `src/repository/auth.ts` — `getUserByUsername`, `getUserById`, `createUser`, `updatePasswordHash`

---

## Task: T07 — Service: auth business logic

**Layer**: Service
**Estimate**: 2hr
**Depends on**: T06
**Status**: PENDING

### What to build
Implement auth service functions: `login()` (username lookup → bcrypt compare → JWT sign), `verifyToken()` (JWT verify with cached secret → decoded payload), `changePassword()` (re-verify current password → bcrypt hash new password → update profile), and `createUser()` (validate username uniqueness → bcrypt hash → call repo). All functions throw typed errors (`InvalidCredentialsError`, `UsernameTakenError`, etc.) that handlers map to HTTP responses.

### Acceptance criteria
- [ ] `login()` returns `{ token, expiresAt }` on valid credentials
- [ ] `login()` throws `InvalidCredentialsError` for wrong password AND unknown username (same error, no enumeration)
- [ ] JWT `exp` is exactly `iat + 86400`
- [ ] `changePassword()` throws `InvalidCredentialsError` when `currentPassword` does not match
- [ ] `changePassword()` throws `ValidationError` when `newPassword === currentPassword`
- [ ] `verifyToken()` throws `UnauthorizedError` on expired or malformed JWTs
- [ ] Unit test coverage ≥ 80% of service lines; uses `aws-sdk-client-mock` for S3

### Files expected
- `src/service/auth.ts` — login, verifyToken, changePassword, createUser service functions
- `src/service/errors.ts` — typed error classes used across all services

---

## Task: T08 — Handler: Hono app, JWT middleware, and auth routes

**Layer**: Handler
**Estimate**: 2hr
**Depends on**: T07
**Status**: PENDING

### What to build
Create the Hono application with a JWT middleware (validates `Authorization: Bearer` header on all routes except `POST /auth/login`) and implement the three auth routes: `POST /auth/login`, `POST /auth/password`, `POST /admin/users`. All request bodies are validated with Zod at the handler layer. Map service errors to HTTP status codes. Set CORS headers restricted to the CloudFront domain env var.

### Acceptance criteria
- [ ] `POST /auth/login` with valid body returns 200 `{ token, expiresAt }`
- [ ] `POST /auth/login` with invalid credentials returns 401 `{ error: "INVALID_CREDENTIALS" }`
- [ ] `POST /auth/password` without JWT returns 401 before reaching service
- [ ] `POST /auth/password` with wrong current password returns 401 `{ error: "WRONG_CURRENT_PASSWORD" }`
- [ ] `POST /admin/users` with non-admin JWT returns 403
- [ ] Zod validation failure on any route returns 422 with `{ error: "VALIDATION_ERROR", fields }`
- [ ] `Authorization` header value is never written to logs

### Files expected
- `src/handler/app.ts` — Hono app instance, CORS middleware, JWT middleware
- `src/handler/auth.ts` — login, password, admin-users route handlers
- `src/handler/lambda.ts` — Lambda Function URL entry point (`handle` from `hono/aws-lambda`)

---

## Task: T09 — Infra: Lambda function, IAM role, and Function URL

**Layer**: Infra
**Estimate**: 1hr
**Depends on**: T02, T08
**Status**: PENDING

### What to build
Add Terraform resources for the write-API Lambda: IAM execution role (S3 read/write on the app bucket, SSM GetParameter on the JWT secret), Lambda function referencing `dist/lambda.zip`, and a Lambda Function URL with `AUTH_TYPE = NONE` (auth is handled by the JWT middleware, not IAM). Add the Function URL as a second CloudFront origin so write requests are routed through CloudFront at the `/api/*` path prefix.

### Acceptance criteria
- [ ] `terraform apply` creates the Lambda, IAM role, and Function URL without errors
- [ ] Lambda environment variables include `BUCKET_NAME`, `ENV`, `ADMIN_USERNAME`, `CLOUDFRONT_DOMAIN` — no secrets in env vars
- [ ] IAM role grants `s3:GetObject`, `s3:PutObject` on `arn:aws:s3:::${bucket}/*` and `ssm:GetParameter` on the JWT secret ARN only
- [ ] CloudFront routes `/api/*` requests to the Lambda Function URL origin
- [ ] CORS `AllowOrigins` on the Lambda is set to the CloudFront domain, not `*`

### Files expected
- `infra/lambda.tf` — Lambda function, IAM role, IAM policy, Function URL
- `infra/cloudfront.tf` — updated with `/api/*` cache behaviour pointing to Lambda origin

---

## Task: T10 — UI: React Router, auth context, ProtectedRoute, app shell

**Layer**: UI
**Estimate**: 2hr
**Depends on**: T03, T08
**Status**: PENDING

### What to build
Bootstrap the SPA: React Router v6 routes for all 8 screens, an `AuthContext` that stores the JWT in `localStorage` (with expiry check on load), a `ProtectedRoute` component that redirects to `/login?return=<path>` when unauthenticated, a global nav component (logo → Dashboard, Browse Scripture, Import Article, username dropdown with Change Password + Log Out), and a TanStack Query client provider. Wire up the API client helper that attaches `Authorization: Bearer` and handles 401 by redirecting to login.

### Acceptance criteria
- [ ] Visiting `/` without a JWT redirects to `/login?return=/`
- [ ] Valid JWT in `localStorage` skips login and lands on Dashboard
- [ ] Expired JWT (check `exp` claim on load) is cleared and redirects to login
- [ ] Logging out clears `localStorage` and redirects to `/login`
- [ ] `?return=` path is restored after successful login
- [ ] Nav dropdown shows "Change Password" and "Log Out"; "Log Out" clears the JWT

### Files expected
- `src/ui/lib/api-client.ts` — fetch wrapper with auth header + 401 handler
- `src/ui/lib/auth-context.tsx` — AuthContext, useAuth hook
- `src/ui/components/ProtectedRoute.tsx`
- `src/ui/components/Nav.tsx` — global nav with dropdown
- `src/ui/main.tsx` — React Router route tree, QueryClientProvider

---

## Task: T11 — UI: Login screen

**Layer**: UI
**Estimate**: 1hr
**Depends on**: T10
**Status**: PENDING

### What to build
Implement the Login screen at `/login` covering all five wireframe states: default (empty form), loading (disabled inputs + "Signing in…"), invalid credentials (red alert, both fields error-bordered, password cleared), rate-limited (amber alert, form disabled), and session-expired (blue info alert). On success, store the JWT and navigate to `?return` destination or `/`.

### Acceptance criteria
- [ ] Submitting valid credentials stores the JWT and navigates to the return URL
- [ ] 401 response shows "Invalid username or password" without specifying which field
- [ ] 429 response shows rate-limit warning and disables the form
- [ ] `?return=` param present shows the session-expired info alert
- [ ] Password field cleared on 401; username field retains its value
- [ ] No "Forgot password" or "Sign up" links present

### Files expected
- `src/ui/pages/LoginPage.tsx`

---

## Task: T12 — UI: Change Password screen

**Layer**: UI
**Estimate**: 1hr
**Depends on**: T10, T08
**Status**: PENDING

### What to build
Implement the Change Password screen at `/settings/password` covering all six wireframe states: empty form, client-side validation errors (confirm mismatch, new same as current), server error (wrong current password — only current field cleared, new fields preserved), loading, and success (green alert, JWT-stays-valid note, form reset). Accessible from the nav dropdown.

### Acceptance criteria
- [ ] Client validates confirm-mismatch and new-same-as-current before any API call
- [ ] 401 `WRONG_CURRENT_PASSWORD` clears only the current password field; new password fields retain values
- [ ] 200 response shows green success alert and resets all three fields
- [ ] All inputs and buttons disabled during loading
- [ ] "← Dashboard" and "Cancel" both navigate to `/` without confirmation

### Files expected
- `src/ui/pages/ChangePasswordPage.tsx`

---

## Phase 3 — Scripture

---

## Task: T13 — Data: scripture ingestion script

**Layer**: Infra / Data
**Estimate**: 4hr
**Depends on**: T05
**Status**: PENDING

### What to build
Write a Node.js script (`scripts/ingest-scripture.ts`) that fetches all four Standard Works from `churchofjesuschrist.org`, parses each chapter into the `ScriptureChapter` schema, and uploads JSON files to the correct S3 paths. Also generates and uploads `content/scripture/manifest.json`. The script is idempotent: it skips files already present in S3 (checked via `HeadObject`). Run once against the dev bucket before first deploy.

### Acceptance criteria
- [ ] Script completes without error and uploads all expected chapter files across all four works
- [ ] Each chapter file validates against the `ScriptureChapter` Zod schema
- [ ] `manifest.json` lists all works with correct book slugs and `chapterCount` values
- [ ] D&C chapters use `book: "dc"` and `chapter` = section number
- [ ] PoGP single-chapter books (`articles-of-faith`, `joseph-smith-matthew`) have `chapterCount: 1`
- [ ] Re-running the script does not overwrite existing files (idempotent)

### Files expected
- `scripts/ingest-scripture.ts` — fetch, parse, upload script
- `scripts/ingest-scripture.README.md` — instructions for running against dev and prod buckets

---

## Task: T14 — Repository: scripture S3 reads and TanStack Query hooks

**Layer**: Repository
**Estimate**: 1hr
**Depends on**: T05
**Status**: PENDING

### What to build
Implement `getScriptureManifest()` and `getScriptureChapter(work, book, chapter)` — read-only functions that call CloudFront, validate the response against Zod schemas, and return typed data. Include the corresponding client-side TanStack Query hooks.

### Acceptance criteria
- [ ] `getScriptureChapter("book-of-mormon", "alma", 32)` returns a fully typed `ScriptureChapter`
- [ ] Non-existent chapter returns `null` (404 → null, not a throw)
- [ ] `useManifest()` result is cached with `staleTime: Infinity`
- [ ] Zod parse failure throws a typed `DataIntegrityError`

### Files expected
- `src/repository/scripture.ts` — `getScriptureManifest`, `getScriptureChapter`
- `src/ui/lib/queries/scripture.ts` — `useManifest`, `useChapter` TanStack Query hooks

---

## Task: T15 — UI: Scripture Browser (Work / Book / Chapter selection)

**Layer**: UI
**Estimate**: 2hr
**Depends on**: T14
**Status**: PENDING

### What to build
Implement the three-level Scripture Browser at `/scripture`, `/scripture/:work`, and `/scripture/:work/:book`. Work selection: 4 cards. Book selection: book list with chapter count; Bible grouped under OT/NT headers. Chapter selection: number grid. Handle D&C (skip book level) and PoGP single-chapter books (navigate directly to Chapter View). Include breadcrumb navigation. Chapter tiles for chapters with existing journal entries get a dark-fill indicator (derived from UserIndex in TanStack Query cache; degrades gracefully if not loaded).

### Acceptance criteria
- [ ] Clicking BoM navigates to `/scripture/book-of-mormon`; clicking a book navigates to chapter grid
- [ ] Clicking D&C navigates directly to section grid (no book screen)
- [ ] Clicking "Articles of Faith" navigates directly to `/scripture/pearl-of-great-price/articles-of-faith/1`
- [ ] "Browse Scripture" nav link always navigates to `/scripture`
- [ ] Breadcrumb "Scripture ›" at book level navigates back to work selection
- [ ] Invalid work slug shows "Not found" with link back to `/scripture`

### Files expected
- `src/ui/pages/ScriptureBrowserPage.tsx` — handles all three levels via URL params

---

## Task: T16 — UI: Chapter View (content only)

**Layer**: UI
**Estimate**: 2hr
**Depends on**: T14, T15
**Status**: PENDING

### What to build
Implement the Chapter View at `/scripture/:work/:book/:chapter`. Fetch and render the chapter as an ordered verse list in serif font. Show a loading skeleton while fetching. Show "← Previous Chapter" and "Next Chapter →" (hidden on first/last chapter). Breadcrumb back to book level. Annotation display and "+" editor are layered on in T23 — this task renders content only.

### Acceptance criteria
- [ ] Verses render in order with 1-indexed numbers in a serif font
- [ ] Loading skeleton covers the full verse area during fetch
- [ ] "← Previous Chapter" absent on chapter 1; "Next Chapter →" absent on last chapter of book
- [ ] Breadcrumb shows Work › Book › Chapter N, each segment clickable
- [ ] Invalid chapter number shows "Chapter not found" with back link

### Files expected
- `src/ui/pages/ChapterViewPage.tsx`
- `src/ui/components/VerseList.tsx` — pure verse rendering component

---

## Phase 4 — Article Import

---

## Task: T17 — Repository: article S3 reads and writes

**Layer**: Repository
**Estimate**: 1hr
**Depends on**: T05
**Status**: PENDING

### What to build
Implement server-side article repository functions: `getArticle(articleId)`, `putArticle(article)` (write-once with `If-None-Match: *`), `getArticleUrlIndex(urlHash)`, and `updateArticleUrlIndex(urlHash, newVersion)` (conditional write via `conditionalWrite` utility from T05).

### Acceptance criteria
- [ ] `putArticle()` uses `If-None-Match: *` — second write of same articleId is silently accepted (content-addressed, identical bytes)
- [ ] `updateArticleUrlIndex()` appends to `versions[]` via `conditionalWrite` with retry
- [ ] `getArticle()` returns `null` for unknown articleId
- [ ] All responses validated against Zod schemas from T03

### Files expected
- `src/repository/article.ts` — `getArticle`, `putArticle`, `getArticleUrlIndex`, `updateArticleUrlIndex`

---

## Task: T18 — Service and Handler: POST /articles/import

**Layer**: Service + Handler
**Estimate**: 3hr
**Depends on**: T08, T17
**Status**: PENDING

### What to build
Implement the article import service and its Hono route. Service logic: validate allowlist → fetch URL (10s timeout, descriptive User-Agent) → strip HTML (`<p>` text extraction) → derive title (`og:title` → `<title>` → `<h1>` → truncated first paragraph) → compute SHA-256 → duplicate check → URL index version check → write article + update index on new/confirmed import. Manual paste mode skips fetch. Return status discriminants (`IMPORTED`, `DUPLICATE`, `NEW_VERSION`, `VERSION_IMPORTED`).

### Acceptance criteria
- [ ] Non-allowlisted URL returns 422 `DOMAIN_NOT_ALLOWED` with zero outbound HTTP requests made
- [ ] Fetch timeout after 10s returns 422 `FETCH_FAILED`
- [ ] Duplicate detection returns `DUPLICATE` without writing a new S3 file
- [ ] New version flow: first call returns `NEW_VERSION`; second call with `confirm: true` returns `VERSION_IMPORTED` with `previousVersionId` set
- [ ] Manual paste with `{ url, text, title }` stores article with paragraphs split on `\n\n`
- [ ] Unauthenticated request returns 401
- [ ] Golden-file test: known HTML input → expected `paragraphs[]` shape

### Files expected
- `src/service/article-import.ts` — full import pipeline
- `src/handler/article.ts` — `POST /articles/import` Hono route

---

## Task: T19 — UI: Article Import Modal

**Layer**: UI
**Estimate**: 2hr
**Depends on**: T10, T18
**Status**: PENDING

### What to build
Implement the Article Import Modal as an overlay triggered by "Import Article" in the nav. Cover all seven wireframe states: default URL input, loading, allowlist error, fetch failed (with "Paste manually →" link), manual paste form, duplicate warning, and new version confirmation. On successful import, navigate to `/articles/<articleId>`.

### Acceptance criteria
- [ ] Modal dismissible by ✕ and Cancel in all non-loading states
- [ ] Loading state disables all controls including ✕
- [ ] `DOMAIN_NOT_ALLOWED` shows inline error on the URL field
- [ ] `FETCH_FAILED` reveals "Paste article text manually instead →" link
- [ ] Manual paste "← Back to URL" preserves the URL in the URL field
- [ ] `DUPLICATE` shows article title and original import date; "Open Existing" navigates to the article
- [ ] `NEW_VERSION` requires explicit "Create New Version" confirmation before storing

### Files expected
- `src/ui/components/ArticleImportModal.tsx`

---

## Task: T20 — UI: Article View (content only)

**Layer**: UI
**Estimate**: 2hr
**Depends on**: T19
**Status**: PENDING

### What to build
Implement the Article View at `/articles/:articleId`. Render paragraphs in serif font. Show article title, source URL link (↗), import date, and version badge + blue notice bar if `previousVersionId` is set. Loading skeleton during fetch. Past entry mode (entered via `/entries/:entryId`): "Past Entry" banner, muted palette, no "+" icons, "Study Today →" button. Annotation display and live "+" editor are added in T23.

### Acceptance criteria
- [ ] Paragraphs render in serif font
- [ ] `previousVersionId` present → blue version-notice bar with link to prior version and "Version N" badge
- [ ] Source URL link opens in new tab
- [ ] Loading skeleton covers content area during fetch
- [ ] Past entry mode: "Past Entry" banner states session date; no "+" icons; "Study Today →" navigates to `/articles/<articleId>`

### Files expected
- `src/ui/pages/ArticleViewPage.tsx`
- `src/ui/components/ParagraphList.tsx` — pure paragraph rendering component

---

## Phase 5 — Annotation

---

## Task: T21 — Repository: JournalEntry and UserIndex conditional writes

**Layer**: Repository
**Estimate**: 2hr
**Depends on**: T05
**Status**: PENDING

### What to build
Implement server-side repository functions: `getEntry(userId, entryId)` (returns entry + ETag or null), `putEntry(userId, entry, etag?)` (conditional write), `getUserIndex(userId)`, `updateUserIndex(userId, entryUpdate)` (conditional write), and `appendAnnotation(userId, entryId, annotation, contentMeta)` — the higher-order function that wraps find-or-create + append + conditional write with retry.

### Acceptance criteria
- [ ] `appendAnnotation()` on a new entryId writes with `If-None-Match: *`
- [ ] `appendAnnotation()` on an existing entryId re-reads, appends, retries on 412 (up to 3×)
- [ ] `snippet` in UserIndex is set from the first annotation only; subsequent annotations update `noteCount` but not `snippet`
- [ ] `WriteConflictError` propagates if all retries fail

### Files expected
- `src/repository/annotation.ts` — `getEntry`, `putEntry`, `getUserIndex`, `updateUserIndex`, `appendAnnotation`

---

## Task: T22 — Service and Handler: POST /entries/annotate

**Layer**: Service + Handler
**Estimate**: 2hr
**Depends on**: T08, T21
**Status**: PENDING

### What to build
Implement the annotation service and its Hono route. Service derives `userId` from JWT `sub` (never from request body), computes deterministic `entryId` from `date` + `sha256(contentRef).slice(0,16)`, validates `contentRef` prefix (must start with `content/`), calls `appendAnnotation`, and returns the saved annotation with updated `noteCount`. Maps `WriteConflictError` to 409.

### Acceptance criteria
- [ ] `userId` always sourced from JWT `sub`; any `userId` in request body is ignored
- [ ] `contentRef` with `users/<otherId>/` prefix returns 422
- [ ] `entryId` is deterministic: same `date` + `contentRef` always produces the same value
- [ ] `createdAt` is server-assigned ISO 8601 UTC
- [ ] `WriteConflictError` maps to 409 `WRITE_CONFLICT`
- [ ] Empty `text` returns 422 before any S3 call
- [ ] Annotation text does not appear in any log statement

### Files expected
- `src/service/annotation.ts` — annotation service logic
- `src/handler/annotation.ts` — `POST /entries/annotate` Hono route

---

## Task: T23 — UI: Inline "+" editor and saved annotation display

**Layer**: UI
**Estimate**: 2hr
**Depends on**: T16, T20, T22
**Status**: PENDING

### What to build
Implement the shared annotation interaction layered onto both Chapter View and Article View: "+" button on block hover (≤100ms, no layout shift), inline `<textarea>` editor anchored below the block, "Save Note" calls `POST /entries/annotate` with the client's local date. On success, render the saved annotation in a sans-serif left-bordered box below the block. On error, show inline error strip with Retry. On 401, save text to `sessionStorage["pendingNote"]` and redirect to login, restoring on return. Render "Today's session · N notes" badge in the content header.

### Acceptance criteria
- [ ] "+" appears within 100ms of hover with no layout shift
- [ ] Only one editor open at a time; clicking a second "+" while an editor is open does nothing
- [ ] Cancel closes editor without saving and without a confirmation dialog
- [ ] Source content rendered in serif; annotation text rendered in sans-serif
- [ ] 5xx: inline error strip with preserved note text and Retry button
- [ ] 401: `sessionStorage["pendingNote"]` set; note restored after re-login
- [ ] Past entry mode (T20 flag): no "+" icons rendered

### Files expected
- `src/ui/components/AnnotationEditor.tsx` — inline editor with all states
- `src/ui/components/SavedAnnotation.tsx` — display of a persisted annotation
- `src/ui/hooks/useAnnotationEditor.ts` — editor state management hook

---

## Phase 6 — Dashboard

---

## Task: T24 — UI: Dashboard

**Layer**: UI
**Estimate**: 2hr
**Depends on**: T10, T21
**Status**: PENDING

### What to build
Implement the Dashboard at `/`. Fetch `users/<userId>/index.json` via CloudFront. Render: single-entry days as full cards (date, type badge, title, snippet, note count); multi-entry days as grouped header + compact rows (type badge, title, note count; no snippet). Calendar: current month with marked days; clicking a marked day filters the list. Empty state: "Your journal is empty" with "Browse Scripture" and "Import Article" CTA buttons.

### Acceptance criteria
- [ ] Single-entry day renders snippet; multi-entry day renders grouped header + compact rows without snippet
- [ ] Content type badge reads "SCRIPTURE" or "ARTICLE" on all cards and rows
- [ ] Clicking an entry card or row navigates to `/entries/<entryId>`
- [ ] Calendar marks correct days; clicking a marked day filters the list to that date; clicking again clears the filter
- [ ] Zero-entry UserIndex shows empty state with two CTA buttons
- [ ] Loading skeleton shown while UserIndex fetches

### Files expected
- `src/ui/pages/DashboardPage.tsx`
- `src/ui/components/EntryCard.tsx` — full single-entry day card
- `src/ui/components/EntryDayGroup.tsx` — grouped multi-entry day
- `src/ui/components/JournalCalendar.tsx` — calendar with marked days

---

## Task: T25 — UI: Past Entry View

**Layer**: UI
**Estimate**: 1hr
**Depends on**: T24, T23
**Status**: PENDING

### What to build
Implement the Past Entry View at `/entries/:entryId`. Fetch the `JournalEntry` then fetch the content at `entry.contentRef`. Render read-only using the existing Chapter View or Article View components with a `readOnly` prop: "Past Entry" banner with session date, muted palette, no "+" icons, that entry's `annotations[]` shown inline via `SavedAnnotation`. "Study Today →" navigates to the live content page.

### Acceptance criteria
- [ ] Content renders in muted palette; no "+" icons present
- [ ] Only annotations from the specific JournalEntry are shown
- [ ] "Past Entry" banner states session date formatted in the user's browser locale
- [ ] "Study Today →" navigates to the correct live content route
- [ ] Versioned article shows the "Version N" badge matching the entry's contentRef
- [ ] Unknown `entryId` shows "Entry not found" with a link to Dashboard

### Files expected
- `src/ui/pages/PastEntryPage.tsx`

---

## Phase 7 — Tests

---

## Task: T26 — Tests: auth service unit tests

**Layer**: Test
**Estimate**: 2hr
**Depends on**: T07
**Status**: PENDING

### What to build
Comprehensive unit tests for `src/service/auth.ts` using Vitest and `aws-sdk-client-mock`. Cover: successful login, wrong password, unknown username, change password happy path, change password with wrong current, change password same-as-current, createUser success, createUser duplicate username, verifyToken valid/expired/malformed.

### Acceptance criteria
- [ ] Line coverage ≥ 80% for `src/service/auth.ts`
- [ ] Wrong password and unknown username both throw `InvalidCredentialsError` with identical message
- [ ] JWT `exp` in login result is exactly `iat + 86400` (verified by decoding the token)
- [ ] All S3 calls mocked with `aws-sdk-client-mock`; no real AWS calls

### Files expected
- `src/service/__tests__/auth.test.ts`

---

## Task: T27 — Tests: article import service unit tests

**Layer**: Test
**Estimate**: 2hr
**Depends on**: T18
**Status**: PENDING

### What to build
Unit tests for `src/service/article-import.ts`. Cover: allowlist rejection (no fetch), fetch timeout, fetch non-2xx, HTML stripping golden file, SHA-256 computation, duplicate detection, new version detection, new version confirmation flow, manual paste paragraph splitting.

### Acceptance criteria
- [ ] Line coverage ≥ 80% for `src/service/article-import.ts`
- [ ] Fetch is never called when domain is not on allowlist
- [ ] Golden-file test: known HTML input → expected `paragraphs[]` output
- [ ] `DUPLICATE` returned when `getArticle()` mock returns an existing article
- [ ] `NEW_VERSION` returned when URL index mock has a different latest `articleId`

### Files expected
- `src/service/__tests__/article-import.test.ts`

---

## Task: T28 — Tests: annotation service and conditional-write unit tests

**Layer**: Test
**Estimate**: 2hr
**Depends on**: T22
**Status**: PENDING

### What to build
Unit tests for `src/service/annotation.ts` and `src/repository/conditional-write.ts`. Cover: new entry creation (`If-None-Match`), append to existing entry, 412 retry success, 412 exhaustion → `WriteConflictError`, UserIndex update, `contentRef` prefix validation, `userId` sourced from JWT not body.

### Acceptance criteria
- [ ] Line coverage ≥ 80% for both files
- [ ] Retry test confirms exactly 3 retries before `WriteConflictError`
- [ ] `entryId` is deterministic: same inputs always produce same value
- [ ] `createdAt` is server-assigned (not from request body)

### Files expected
- `src/service/__tests__/annotation.test.ts`
- `src/repository/__tests__/conditional-write.test.ts`

---

## Task: T29 — Tests: handler integration tests

**Layer**: Test
**Estimate**: 2hr
**Depends on**: T08, T18, T22
**Status**: PENDING

### What to build
Integration-level tests for all Hono routes using Hono's test utilities. Test happy path + key error paths for each route: 401 without JWT, 401 with expired JWT, 422 on Zod validation failure, 403 non-admin on admin endpoint, 409 write conflict for annotation. Use `vi.mock` to stub service functions.

### Acceptance criteria
- [ ] Every route has at minimum: happy path (200/201), unauthenticated (401), validation failure (422)
- [ ] Auth routes: 401 wrong credentials, 429 rate-limit shape tested
- [ ] Annotation route: 409 write conflict, `userId` from JWT not body
- [ ] Import route: 422 domain-not-allowed, 422 fetch-failed, DUPLICATE and NEW_VERSION shapes

### Files expected
- `src/handler/__tests__/auth.test.ts`
- `src/handler/__tests__/article.test.ts`
- `src/handler/__tests__/annotation.test.ts`
