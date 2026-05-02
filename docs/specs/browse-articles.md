# Spec: Browse Articles

**Status**: APPROVED
**Created**: 2026-04-27
**Last Updated**: 2026-04-27
**Related Specs**: article-import, auth, annotation

---

## Overview

**Summary**: A Browse Articles page at `/articles` lists all previously imported articles as a card grid, sorted newest-first, so a Reader can find and open any article without re-importing it. The page is backed by a lightweight Article Index stored in S3 and served via CloudFront.

**User Roles**: Reader

**Why**: Articles are currently write-only from a discovery perspective — once imported, the only ways to reach an article are through a past journal entry or by knowing its URL directly. Browse Articles gives imported content a first-class home, parallel to Browse Scripture.

---

## User Stories

- As a **Reader**, I want to see all articles I've previously imported in one place, so that I can find and re-open one without re-importing it.
- As a **Reader**, I want each article card to show the title, source domain, and import date, so that I can quickly identify the article I'm looking for.
- As a **Reader**, I want clicking a card to take me directly to the article view page, so that I can start reading or annotating immediately.
- As a **Reader**, I want to search the list by title or source URL, so that I can find a specific article when the list is long.
- As a **Reader**, I want an empty-state prompt when no articles have been imported yet, so that I know what to do next.

---

## Functional Requirements

1. A "Browse Articles" link appears in the top navigation alongside "Browse Scripture" and "Import Article". It is highlighted as active on `/articles`.

2. The Browse Articles page is served at `/articles`.

3. The page fetches `content/articles/index.json` from CloudFront to populate the article list. No Lambda is involved in reading the index.

4. Articles are displayed in a responsive card grid, matching the visual style of the scripture work-selection grid.

5. Each card displays:
   - (a) the article **title** (truncated with ellipsis if it overflows the card),
   - (b) the **domain** of the source URL (e.g., `churchofjesuschrist.org`), not the full URL,
   - (c) the **import date** formatted as `MMM D, YYYY` (e.g., `Apr 22, 2026`).

6. Cards are sorted reverse-chronologically by `importedAt` (most recently imported first).

7. Clicking any card navigates to `/articles/<articleId>`.

8. A text search input above the grid filters the displayed cards client-side. The filter matches against the article title and full source URL (case-insensitive substring match). The grid updates instantly on each keystroke; no server round-trip is needed.

9. When no articles have been imported (empty index), the page displays an empty state with the message "No articles imported yet." and a link to `/import`.

10. When a search query returns no matches, the page displays "No articles match your search." The search input remains visible and focusable.

11. When multiple versions of an article exist for the same source URL, only the **latest version** (the most recent `importedAt`) appears in the index and therefore in the Browse Articles list.

12. A loading skeleton is shown while `content/articles/index.json` is being fetched.

13. **Article Index maintenance**: on every successful article import (`IMPORTED` or `VERSION_IMPORTED` response), the import handler updates `content/articles/index.json` and then issues a CloudFront invalidation for that path so the updated list is immediately visible.

14. When a new version is imported, the existing index entry for that source URL is **replaced** with the new version's entry. The index never contains two entries for the same source URL.

---

## Data Model

### `ArticleIndex` — `content/articles/index.json`

```typescript
interface ArticleIndex {
  articles: Array<{
    articleId: string;    // SHA-256(plainText) lowercase hex — matches Article.articleId
    title: string;        // matches Article.title
    sourceUrl: string;    // matches Article.sourceUrl
    importedAt: string;   // ISO 8601 — matches Article.importedAt for this version
  }>;                     // sorted newest-first by importedAt
}
```

Validation rules:
- `articleId`: 64-character lowercase hex string (required)
- `title`: non-empty string (required)
- `sourceUrl`: valid HTTPS URL string (required)
- `importedAt`: ISO 8601 datetime string (required)
- Array is pre-sorted newest-first at write time; the client renders in array order

The index contains one entry per source URL (latest version only). The full `Article` object at `content/articles/<articleId>.json` is the authoritative record; the index is a display cache only.

### Changes to `POST /articles/import` write flow

After a successful `IMPORTED` or `VERSION_IMPORTED` response, the import handler must:

1. Read `content/articles/index.json` with `If-Match` ETag (treat 404 as an empty index `{ articles: [] }`).
2. For `IMPORTED`: prepend the new entry to `articles[]`.
3. For `VERSION_IMPORTED`: remove any existing entry matching `sourceUrl`, then prepend the new entry.
4. Write the updated index back with `If-Match` ETag. On 412 conflict, re-read and retry (max 3 times).
5. After a successful write, issue a CloudFront invalidation for `/content/articles/index.json`.

---

## API Contract

### No new endpoints

Browse Articles is a read-only SPA page. There is no new Lambda endpoint — the article list is fetched directly from CloudFront-cached S3.

### Changes to `POST /articles/import`

The response contract is unchanged (see article-import spec). The internal write flow gains steps 1–5 described in the Data Model section above. No changes to request or response shape.

### `GET content/articles/index.json` (CloudFront/S3, no Lambda)

**Auth required**: No — served by CloudFront (same public-read posture as all `content/` objects).

**200 OK**:
```typescript
ArticleIndex  // as defined above
```

**404**: Index does not exist yet (no articles imported). The SPA treats a 404 on this path identically to `{ articles: [] }` and shows the empty state.

---

## Error States & Edge Cases

| Scenario | Behaviour |
|----------|-----------|
| `content/articles/index.json` returns 404 | SPA treats as empty index; shows empty-state UI |
| `content/articles/index.json` fetch fails (network error) | Show inline error: "Could not load articles. Check your connection and try again." with a Retry button |
| Index exists but is malformed JSON | Show same network-error message; log parse error to console |
| Index 412 conflict on 4th retry during import | Article is written; index update fails; log data-inconsistency error. Article is accessible via direct URL and past journal entries but will not appear in Browse Articles until next successful index write |
| Search returns zero results | Display "No articles match your search." — grid clears, no error state |
| Article card navigates to a deleted/missing article | Article view page handles the 404 (out of scope for this spec) |
| Two simultaneous imports | Each Lambda reads the current index ETag; one wins, the other retries. Both articles eventually land in the index via the retry loop |

---

## Acceptance Criteria

### Navigation & Page Load

- [ ] "Browse Articles" link appears in the top nav alongside "Browse Scripture" and "Import Article".
- [ ] The link is highlighted as active when the current route is `/articles`.
- [ ] Navigating to `/articles` renders the page without a full-page reload (SPA navigation).
- [ ] A loading skeleton is visible while `content/articles/index.json` is fetching.

### Article List

- [ ] Given articles have been imported, the page displays one card per source URL (latest version only).
- [ ] Cards are ordered newest `importedAt` first.
- [ ] Each card shows the article title, source domain (not full URL), and import date formatted as `MMM D, YYYY`.
- [ ] Clicking a card navigates to `/articles/<articleId>`.

### Empty State

- [ ] Given no articles have been imported (`index.json` is 404 or `articles: []`), the page displays "No articles imported yet." and a link to `/import`.
- [ ] Clicking the empty-state link navigates to `/import`.

### Search

- [ ] A search input is rendered above the card grid.
- [ ] Typing in the search input filters cards in real time (no submit/enter required).
- [ ] The filter matches against title and full source URL, case-insensitively.
- [ ] Clearing the search input restores the full card list.
- [ ] When no cards match the query, "No articles match your search." is displayed.

### Article Index — Import Integration

- [ ] After a successful `IMPORTED` import, the new article appears in the Browse Articles list on the next page load (CloudFront invalidation ensures the stale cached index is not served).
- [ ] After a successful `VERSION_IMPORTED` import, the Browse Articles list shows the new version's card (updated `importedAt`) and the old version's card is gone.
- [ ] Two simultaneously imported articles both eventually appear in the index (retry loop resolves the conflict).

### Error Handling

- [ ] If `index.json` fails to fetch (network error), an inline error message and Retry button appear; no crash or blank page.

---

## Non-Functional Requirements

- **Performance**: The Browse Articles page renders its card grid within 500ms at p95, served from CloudFront-cached S3 (same budget as content pages — NFR-B01).
- **Cost**: Index is a single S3 object; CloudFront invalidation is issued once per import. At Phase 1 volume, well within $1/month budget. No additional Lambda invocations beyond the existing import flow.
- **Security**: `content/articles/index.json` is a public-read CloudFront object (same posture as all `content/` files). No PII in the index. Index reads require no auth. Index writes are performed only by the authenticated import Lambda.

---

## Out of Scope

- Deleting or archiving articles from the Browse Articles page (FR-B30)
- Filtering by date range, annotation count, or source domain (FR-B31)
- Sorting options other than newest-first (FR-B32)
- Per-article annotation counts in the card (FR-B33)
- Older article versions appearing in the Browse Articles list (FR-B34)
- Private-scope article browsing (Phase 2+)
- Pagination (index is a single object; sufficient for Phase 1 volume)
