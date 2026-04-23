# Requirements: Scripture Journal (Phase 1)

**Source Brief**: [docs/briefs/scripture-journal-brief.md](../briefs/scripture-journal-brief.md)
**Status**: APPROVED
**Created**: 2026-04-21

## Problem Statement

Peter wants to keep personal study notes on scripture and religious articles in a way that ties each note to the specific verse or paragraph that prompted it, preserves the source content so links can never rot, and lets him look back over time. Existing tools either store notes separately from source (losing context) or depend on external URLs (losing content when things move or get taken down).

## User Roles & Goals

| Role | Goal | Frequency |
|------|------|-----------|
| Reader (authenticated user) | Read a scripture chapter or article, attach block-level annotations for today, return later to read and remember | Daily to weekly |
| Admin (operator, initially Peter) | Create new user accounts out-of-band; approve new allowlisted content sources | Occasionally |

There is no anonymous/public visitor role in Phase 1 — the app is authenticated-only.

## Functional Requirements

### MUST HAVE — Authentication

FR-01 [MUST] An authenticated user can log in using their username and password.
FR-02 [MUST] The system shall store passwords in a non-reversible hashed form.
FR-03 [MUST] The system shall issue a signed session token on successful login that authorizes subsequent write requests.
FR-04 [MUST] The system shall expire session tokens after 24 hours; expired tokens require re-login.
FR-05 [MUST] An authenticated user can log out, invalidating their session on the client.
FR-06 [MUST] An admin can create a new user account by providing a username and initial password (via CLI or admin-only endpoint, not a public form).
FR-07 [MUST] A logged-in user can change their own password.
FR-08 [MUST] Usernames shall be unique across the system (case-insensitive, normalized to lowercase).

### MUST HAVE — Scripture Content

FR-10 [MUST] The system shall include pre-loaded text of all four LDS Standard Works: Bible (KJV), Book of Mormon, Doctrine and Covenants, and Pearl of Great Price.
FR-11 [MUST] A user can browse scripture by Work → Book → Chapter.
FR-12 [MUST] A user can view a single chapter displayed as an ordered list of verses, each verse a distinct annotatable block.
FR-13 [MUST] Scripture content is scope=shared — stored once and accessible to all authenticated users.

### MUST HAVE — Article Import

FR-20 [MUST] A user can import an article from an allowlisted source domain by providing its URL. For Phase 1 the allowlist contains `churchofjesuschrist.org` only.
FR-21 [MUST] The system shall fetch the URL, strip HTML to plain text (preserving paragraph structure via `<p>` boundaries), and store the result.
FR-22 [MUST] The system shall content-address each imported article by the SHA-256 of its plain-text content; identical text is stored exactly once regardless of source URL.
FR-23 [MUST] When a user imports a URL whose plain-text hash matches an existing article, the system shall warn them ("Already imported on {date} — use existing or re-import?") and let them choose.
FR-24 [MUST] If URL fetching fails (network error, non-2xx status, empty content, > 10s timeout), the system shall allow the user to paste plain text manually as a fallback.
FR-25 [MUST] The system shall preserve the original source URL and the import date with each article's metadata.
FR-26 [MUST] Articles imported from allowlisted sources are scope=shared — accessible to all authenticated users with a single canonical copy.
FR-27 [MUST] When a user re-imports a URL whose plain-text content differs from a previously imported version, the system shall:
  (a) create a new article with a new `articleId` (its own content hash),
  (b) record a `previousVersionId` pointing to the prior version,
  (c) update the per-URL version index so the new version becomes current,
  (d) clearly indicate to the user that they are viewing a new version and show the previous import date.

### MUST HAVE — Content Scope

FR-28 [MUST] Every piece of imported content has a `scope` of either "shared" or "private", determined at import time based on the source domain.
FR-29 [MUST] Shared content is stored at a canonical app-wide location (`content/...`). Private content is stored under the importing user's own prefix (`users/<userId>/content/...`) and is accessible only to that user.

### MUST HAVE — Annotation

FR-40 [MUST] On a content page (scripture chapter or article), a "+" icon shall appear next to each block (verse or paragraph) on hover.
FR-41 [MUST] Clicking a block's "+" icon opens an inline note editor anchored to that block.
FR-42 [MUST] A user can save a note; the note is persisted and associated with the current journal entry, the content piece (by `contentRef` which includes the specific article version), and the specific block.
FR-43 [MUST] Saved notes for today's entry are displayed inline next to the block they annotate.
FR-44 [MUST] Notes from prior entries for the same content are NOT shown during today's session (Phase 2 feature).
FR-45 [MUST] Source content and user notes shall be visually distinguished via different font families.

### MUST HAVE — Journal Entries

FR-50 [MUST] When a user opens a content page on a given date, the system shall find-or-create a single journal entry for that (user, date, contentRef) tuple.
FR-51 [MUST] All annotations saved during that visit attach to that single entry.
FR-52 [MUST] A user can see a chronological list of their past journal entries. Days with a single entry show a full card: date, content type, content title, snippet (= text of the user's first saved annotation for that entry), and note count. Days with two or more entries show a grouped card: date header with entry count, then a compact row per entry showing content type, content title, and note count only — no snippet text.
FR-53 [MUST] Clicking a past entry (or a row within a grouped day card) displays the content piece pinned to the exact content version the entry was made against, with that entry's annotations rendered inline.

### MUST HAVE — UX Feedback

FR-60 [MUST] The system shall display a loading indicator while fetching content, importing an article, or saving a note.
FR-61 [MUST] The system shall show a friendly error message if a save fails (network, 401, 409, 5xx) and allow retry without losing the user's in-progress note text.

### SHOULD HAVE

FR-70 [SHOULD] The dashboard shall display a calendar view marking days on which the user created at least one journal entry; clicking a day shows the entries for that date.
FR-71 [SHOULD] The user can navigate between consecutive scripture chapters (e.g., Alma 32 → Alma 33) with a single click.

### COULD HAVE

FR-80 [COULD] A user can rename their display name (shown in the header).
FR-81 [COULD] A "recent content" quick-pick on the home screen (last 5 content pieces visited).

### WON'T HAVE (Phase 1 — explicitly out of scope)

FR-90 [WON'T] Editing or deleting annotations after save. Journal entries are append-only; corrections require a new annotation.
FR-91 [WON'T] Sharing annotations or journal entries between users.
FR-92 [WON'T] Phase 2 cross-time view ("show all entries I've made on Alma 32 across all days").
FR-93 [WON'T] Full-text search across annotations or content.
FR-94 [WON'T] Exporting journal data to JSON / Markdown / PDF.
FR-95 [WON'T] Password reset via email (no email infrastructure in Phase 1 — admin manually resets).
FR-96 [WON'T] Mobile-optimized UI (desktop only).
FR-97 [WON'T] Public / unauthenticated read access to any content.
FR-98 [WON'T] Importing articles from sources other than the Phase 1 allowlist. Architecture supports private-scope import from arbitrary sources in Phase 2+; Phase 1 UX does not expose it.
FR-99 [WON'T] Migrating private content to shared scope (or vice versa) after initial import. One-way classification at import time.

## Non-Functional Requirements

### Performance
NFR-01 [Performance] A content page (scripture chapter or article) shall render within 500ms at p95 from CloudFront-cached S3.
NFR-02 [Performance] Saving an annotation shall complete within 1 second at p95 under normal load (single user).
NFR-03 [Performance] Login and admin account-creation shall complete within 2 seconds at p95.
NFR-04 [Performance] Initial SPA shell (first paint) shall load within 1 second at p95 on desktop broadband.

### Security
NFR-10 [Security] All write endpoints require a valid JWT except the login endpoint itself.
NFR-11 [Security] Passwords are stored as bcrypt hashes with cost factor ≥ 12.
NFR-12 [Security] JWTs are signed with HS256 and a secret stored in AWS SSM Parameter Store (SecureString); the secret is never in code or Lambda environment variables in plaintext.
NFR-13 [Security] All API inputs are validated with Zod at the handler layer before reaching service code.
NFR-14 [Security] No passwords, tokens, or annotation content shall appear in CloudWatch logs.
NFR-15 [Security] S3 buckets block all public access; content is served only through CloudFront with Origin Access Control.
NFR-16 [Security] CORS for write Lambdas is restricted to the app's CloudFront domain; no `*` in production.
NFR-17 [Security] Rate limiting is enforced on the login endpoint (reserved concurrency + per-IP throttling) to mitigate brute force.
NFR-18 [Security] Private-scope content under `users/<userId>/` shall be accessible only when the JWT's `sub` claim matches `userId` in the requested object key.

### Availability & Reliability
NFR-20 [Availability] If an S3 conditional write fails (412), the system shall retry up to 3 times with exponential backoff (re-reading latest state and merging) before surfacing an error.
NFR-21 [Availability] If article URL fetching times out (> 10s) the system shall abort and prompt for manual paste.

### Cost
NFR-30 [Cost] Total AWS infrastructure cost shall not exceed $1.00 per month at expected solo usage.
NFR-31 [Cost] A CloudWatch billing alarm shall be configured at $1.00 monthly spend, notifying the owner via email.
NFR-32 [Cost] CloudFront price class shall be restricted to PriceClass_100 (US/EU/Canada) to minimize egress cost.

### Usability
NFR-40 [Usability] Content font and annotation font shall be visually distinct — different font families, not merely different sizes or weights.
NFR-41 [Usability] The "+" annotation icon shall appear within 100ms of hover and shall not cause layout shift.

### Compliance / Legal
NFR-50 [Compliance] The app is and shall remain non-commercial. This is a precondition for scope=shared storage of content covered only by personal/non-commercial Terms of Use.
NFR-51 [Compliance] For each source on the shared-content allowlist, an ADR shall record the ToU review that justified adding it.
NFR-52 [Compliance] No PII beyond usernames is collected; usernames are treated as non-logged data.

## Business Rules

BR-01 Uniqueness: Usernames are unique, case-insensitive (stored normalized to lowercase).
BR-02 Article identity: An article's identity is the SHA-256 of its stripped plain-text content. Two different URLs producing the same plain text become the same article.
BR-03 One-entry-per-day: For a given (user, date, contentRef) there is at most one journal entry. Re-visiting the same content on the same day appends to that entry; different days create different entries.
BR-04 Append-only: Once saved, an annotation cannot be edited or deleted. A user who wants to revise adds a new annotation.
BR-05 Content immutability: Scripture chapter files are immutable after initial load. Article files are immutable after initial import.
BR-06 Ownership: A user can read and write their own journal entries and annotations. Shared artifacts (scripture, allowlisted articles, auth lookup) are readable by all authenticated users. Private-scope content is readable only by its importing user.
BR-07 Block anchoring: An annotation is anchored to a content block by `blockId` (verse number for scripture; zero-indexed paragraph number for articles). Since article version changes produce a new `articleId`, an annotation is naturally pinned to the exact article version at the time of annotation.
BR-08 Session expiry: JWTs expire 24 hours after issue. Expired tokens cannot be refreshed; the user must log in again.
BR-09 Article versioning: Articles are immutable. When the same source URL is re-imported with different plain-text content, a new article is created with `previousVersionId` referencing the previous import. The per-URL version index (`content/articles/url-index/<sha256-of-url>.json`) tracks the ordered chain of versions for each URL.
BR-10 Content scope rule: Content whose copyright holder's Terms of Use permit personal, non-commercial use may be stored as scope=shared (one canonical copy, visible to all users). Content without such permission must be stored as scope=private (per-user copy, visible only to the importing user). The app is non-commercial; this is a precondition for the shared-scope path.
BR-11 Source allowlist: A hard-coded allowlist determines which source domains yield scope=shared content. For Phase 1 the allowlist is: `churchofjesuschrist.org`. Additions require an ADR documenting the ToU review.
BR-12 Content reference encoding: A JournalEntry's `contentRef` is the full S3 object key of the referenced content file (e.g., `content/scripture/bom/alma/32.json` or `users/<userId>/content/articles/<id>.json`). The prefix encodes scope: `content/*` = shared, `users/<userId>/content/*` = private.

## Data Requirements

Key entities (full schemas defined in the spec):

- **User**: `userId` (UUIDv4), `username` (lowercase unique), `passwordHash` (bcrypt), `createdAt`. Stored at `users/<userId>/profile.json`.
- **ScriptureChapter**: `work`, `book`, `chapter`, `title`, `verses: [{ number, text }]`. Stored at `content/scripture/<work>/<book>/<chapter>.json`. Scope=shared.
- **Article**: `articleId` (SHA-256 of plain text), `sourceUrl`, `title`, `importedAt`, `paragraphs: [{ index, text }]`, `previousVersionId?`. Stored at `content/articles/<articleId>.json` (shared) or `users/<userId>/content/articles/<articleId>.json` (private).
- **ArticleUrlIndex**: `sourceUrl`, `versions: [{ articleId, importedAt }]`. Stored at `content/articles/url-index/<sha256-of-url>.json` (shared) or `users/<userId>/content/articles/url-index/<sha256-of-url>.json` (private).
- **JournalEntry**: `entryId` (`${date}_${hashOfContentRef}`), `userId`, `date` (YYYY-MM-DD), `contentRef` (full S3 key), `annotations: [{ blockId, text, createdAt }]`, `updatedAt`. Stored at `users/<userId>/entries/<entryId>.json`.
- **UserIndex**: `entries: [{ entryId, date, contentRef, contentTitle, snippet }]`. Stored at `users/<userId>/index.json`. Updated on each entry save.
- **UsersByName**: map of `{ [lowercaseUsername]: userId }`. Stored at `auth/users-by-name.json`. Single shared file.

## Integration Requirements

INT-01 [churchofjesuschrist.org]: Article import → HTTPS GET the user-provided URL with a descriptive User-Agent → extract main article content, strip to plain text preserving `<p>` boundaries → store. No auth, public HTTP fetch.
  - **Failure modes**: timeout > 10s, non-2xx, empty content → fall back to manual paste UI.
  - **ToU posture**: imports performed under their personal/non-commercial use terms (see ADR to be written).

INT-02 [AWS SSM Parameter Store]: Lambda cold start → fetch JWT signing secret once, cache in Lambda instance memory for the lifetime of the execution environment.
  - **Failure**: SSM unavailable → Lambda init fails → user sees 500 from login endpoint.

INT-03 [AWS S3]: All persistence. Reads via CloudFront (with OAC), writes via Lambda with `If-Match` ETag for per-user files and read-modify-write + retry for shared files.
  - **Failure**: conditional-write conflict → re-read latest, merge, retry with backoff up to 3 times; on persistent failure, surface error.

## Constraints

- **Technical**: Pure content-addressed S3 (no DB). React + Vite SPA on S3/CloudFront. Node 22 Lambda + Hono for writes. Terraform, `us-east-1`.
- **Cost**: ≤ $1/month total AWS infrastructure.
- **Auth**: Custom JWT only; no IdP in Phase 1.
- **Legal**: App must remain non-commercial for the shared-scope path to be defensible.
- **Regulatory**: None — personal tool, minimal PII, no payments.

## Open Questions

| ID | Question | Impact | Owner | Status |
|----|----------|--------|-------|--------|
| Q-01 | Scripture source | Content ingestion + legal posture | Peter | **Resolved**: churchofjesuschrist.org under their personal/non-commercial ToU; content stored as scope=shared. ADR to be written. |
| Q-02 | Article title derivation — `<title>`, `<h1>`, or `<meta property="og:title">`? Which wins when multiple are present? | Article metadata quality | Decide during article-import spec | Open |
| Q-03 | Are in-session (today's) annotations visible in the UI as they are saved? | Annotation UX detail | Peter | **Resolved**: annotations are append-only from save; unsaved drafts live only in the UI; once saved they appear inline and cannot be edited. |
| Q-04 | Two-tab write conflict handling | Rare edge case; data loss risk if mishandled | Implementation | **Resolved**: read-modify-write with 412 retry. On conflict, Lambda re-reads the latest entry, merges the new annotation into the fresh annotations array, retries the PUT. |

## Out of Scope

Phase 1 explicitly excludes (see FR-90 through FR-99 above for the enumerated list). Representative items:

- Phase 2: cross-time view of annotations for a content piece; tagging; categorization.
- Phase 3: sharing entries between users; full-text search; export; private→shared migration.
- Future: mobile-optimized UI, native apps, offline mode, email password reset, IdP auth.
