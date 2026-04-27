# Requirements: Browse Articles

**Status**: APPROVED
**Created**: 2026-04-27
**Related Requirements**: [scripture-journal-requirements.md](./scripture-journal-requirements.md)
**Related Specs**: article-import

---

## Problem Statement

Users can import articles and annotate them, but there is no way to return to a previously imported article without finding it through a past journal entry. Articles are effectively write-only from discovery. A Browse Articles page gives imported articles a browsable home — analogous to how Browse Scripture gives scripture a navigable home.

## User Stories

- As a **Reader**, I want to see a list of all articles I've previously imported, so that I can find and open one without needing to re-import it.
- As a **Reader**, I want to see the title, source domain, and import date for each article, so that I can quickly identify the one I'm looking for.
- As a **Reader**, I want clicking an article to take me directly to its view page, so that I can start reading or annotating immediately.
- As a **Reader**, I want an empty-state prompt when no articles have been imported, so that I know what to do next.

---

## Functional Requirements

### MUST HAVE

FR-B01 [MUST] A "Browse Articles" link shall appear in the top navigation alongside "Browse Scripture" and "Import Article".

FR-B02 [MUST] The Browse Articles page shall display all shared-scope articles that have been imported into the app, in reverse-chronological order of their `importedAt` date (most recent first).

FR-B03 [MUST] Each article entry shall display:
  (a) the article's **title**,
  (b) the **domain** of its source URL (e.g., `churchofjesuschrist.org`),
  (c) the **import date** formatted as a human-readable date (e.g., "Apr 22, 2026").

FR-B04 [MUST] Clicking any article entry navigates to that article's view page (`/articles/{articleId}`).

FR-B05 [MUST] When multiple versions of an article exist (same source URL, different import dates), only the **latest version** is shown in the list. Older versions remain accessible via the "previous version" link within the article view page.

FR-B06 [MUST] When no articles have been imported, the page shall display an empty state with a message and a direct link to `/import`.

FR-B07 [MUST] The system shall maintain an **Article Index** — a lightweight manifest of all imported articles — that is updated atomically on each successful article import. This index is the data source for the Browse Articles page; the page does not scan S3 directly.

### SHOULD HAVE

FR-B10 [SHOULD] A user can search the article list by title or source URL using a text input that filters the displayed list client-side.

FR-B20 [SHOULD] Articles are displayed in a card-based grid layout (matching the visual style of the scripture work-selection grid) rather than a plain list.

### COULD HAVE

FR-B21 [COULD] The import date is displayed as a relative time ("3 days ago") with the absolute date available on hover.

### WON'T HAVE

FR-B30 [WON'T] Deleting or archiving articles from the Browse Articles page (articles are immutable in Phase 1).
FR-B31 [WON'T] Filtering articles by date range, annotation count, or source domain.
FR-B32 [WON'T] Sorting options — reverse-chronological import order is fixed.
FR-B33 [WON'T] Showing per-article annotation counts or any journal/entry data in the article list.
FR-B34 [WON'T] Exposing older article versions in the Browse Articles list (accessible only through the article view chain).

---

## Business Rules

BR-B01 **Article Index scope**: In Phase 1, all articles are scope=shared. The Article Index is stored at `content/articles/index.json` and covers all shared articles.

BR-B02 **Index update atomicity**: On a successful article import (IMPORTED or VERSION_IMPORTED response), the import handler must update the Article Index as part of the same write flow. The index write uses a read-modify-write + conditional-write pattern (If-Match ETag) consistent with the existing annotation write protocol, with up to 3 retries on 412 conflict.

BR-B03 **Latest-version-only display**: For any source URL that has multiple imported versions, the Browse Articles page shows only the article whose `articleId` is the last (most recent) entry in the URL index for that URL. The `previousVersionId` chain on the article view page handles older-version navigation.

BR-B04 **Index entry contents**: Each entry in the Article Index contains exactly the fields needed for the list view: `{ articleId, title, sourceUrl, importedAt }`. Full paragraph content is NOT included in the index.

---

## Data Requirements

**ArticleIndex** (new): `{ articles: [{ articleId, title, sourceUrl, importedAt }] }`
- Stored at `content/articles/index.json`
- Sorted newest-first by `importedAt` to simplify the read path
- Updated (with read-modify-write + retry) on every successful article import
- Each entry corresponds to the latest version for its source URL; when a new version is imported, the previous entry for that URL is replaced, not appended

---

## Non-Functional Requirements

NFR-B01 [Performance] The Browse Articles page shall render its list within 500ms at p95, served from CloudFront-cached S3 (same budget as content pages).

NFR-B02 [Performance] The Article Index shall be a single S3 object (no multi-fetch pagination); at Phase 1 expected volume (< 500 articles), a single index object is well within CloudFront's response-size budget.

---

## Integration Requirements

No new external integrations. The Article Index is read from S3 via CloudFront (same path as all other content reads). Index writes follow the existing Lambda + S3 conditional-write pattern used for journal entries. After each successful index write, the import Lambda shall issue a CloudFront invalidation for `content/articles/index.json` so the updated list is visible immediately.

---

## Open Questions

All open questions resolved.

| ID | Question | Resolution |
|----|----------|------------|
| Q-B01 | Browse Articles URL path | `/articles` |
| Q-B02 | CloudFront cache invalidation on import? | Yes — invalidate `content/articles/index.json` immediately after each successful import write |
| Q-B03 | Empty state action | Direct link to `/import` |

---

## Constraints

Inherits all constraints from the parent requirements document (S3-only persistence, ≤ $1/month AWS cost, React + Vite SPA, Node 22 Lambda + Hono, Terraform, `us-east-1`). No new constraints introduced.
