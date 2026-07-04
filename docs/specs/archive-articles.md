# Spec: Archive Articles

**Status**: IMPLEMENTED
**Created**: 2026-07-02
**Last Updated**: 2026-07-03
**Related Specs**: browse-articles, article-import, annotation

---

## Overview

**Summary**: A Reader can archive an imported article to remove it from the default Browse Articles list while preserving the article content and all journal notes attached to it, and can unarchive it later; a "Show archived" toggle on Browse Articles keeps archived articles reachable.

**User Roles**: Reader

**Why**: The app has no way to declutter the article list today short of deleting content outright, which would destroy annotations tied to it. Archiving lets the Reader keep old or no-longer-relevant articles (and every note written against them) out of the way, without losing anything — and lays the groundwork for a future search feature that can include archived content.

---

## User Stories

- As a **Reader**, I want to archive an article I no longer need in my active list, so that Browse Articles stays focused on what I'm currently reading without losing the article or my notes.
- As a **Reader**, I want to archive an article directly from its card in Browse Articles, so that I don't have to open it first.
- As a **Reader**, I want to archive an article while I'm reading it, so that I can clean up right after I'm done with it.
- As a **Reader**, I want to see my archived articles in a separate view, so that I can find one and bring it back if I need it again.
- As a **Reader**, I want to unarchive an article, so that a mistake or change of mind is easy to undo.
- As a **Reader**, I want my journal entries and annotations tied to an archived article to keep working exactly as before, so that archiving never puts my past work at risk.

---

## Functional Requirements

1. The `Article` object at `content/articles/<articleId>.json` remains immutable and is never modified or deleted by archiving. Archive state is **not** stored on the `Article` record.

2. Archive state is stored per source URL as a new `archived: boolean` field on each entry in `content/articles/index.json` (the existing `ArticleIndexEntry`). Default is `archived: false` for all existing and newly imported entries.

3. A new authenticated endpoint `POST /articles/:articleId/archive` sets `archived: true` on the index entry matching that article's `sourceUrl`, using the existing conditional-write-with-retry pattern (`If-Match`, retry on 412, max 3 attempts, as used for index writes in article-import).

4. A new authenticated endpoint `POST /articles/:articleId/unarchive` sets `archived: false` on the matching index entry, using the same conditional-write pattern.

5. Archiving or unarchiving triggers a CloudFront invalidation of `/content/articles/index.json`, mirroring the existing import flow, so the change is visible on next page load.

6. The Browse Articles page (`/articles`) excludes entries with `archived: true` from the default card grid.

7. Browse Articles gains a "Show archived" toggle (default off). When on, the grid shows **only** archived entries (`archived: true`); when off, it shows only non-archived entries. The toggle does not mix archived and non-archived cards in the same view.

8. Each card in the (non-archived) Browse Articles grid has an "Archive" action (e.g. a kebab/overflow menu) that calls the archive endpoint for that card's article without navigating away from the page. No card state changes before the server confirms — on success, the article index query is invalidated and refetched, and the card disappears once the refetched data reflects the new `archived` flag (the existing `archived === showArchived` filter naturally excludes it; no separate pre-response UI patch is needed).

9. Each card in the archived view has an "Unarchive" action that calls the unarchive endpoint. On success, the same invalidate-and-refetch mechanism removes the card from the archived grid once the refetched data reflects the new `archived` flag.

10. Neither archiving nor unarchiving requires a confirmation dialog — both actions are non-destructive and immediately reversible.

11. The article view page (`/articles/<articleId>`) shows an "Archive" action when the article's current index entry is not archived, and an "Unarchive" action when it is archived. The action reflects live archive state (fetched or refetched on page load), not a static default.

12. Archiving or unarchiving an article from the article view page does not navigate the user away from the page; the action button updates in place to reflect the new state.

13. When a new version of an article is imported for a source URL that is currently archived (`VERSION_IMPORTED`), the replacement index entry is written with `archived: false` (a newly imported version starts unarchived, matching the existing "prepend new entry" behavior in article-import/browse-articles). This applies only to the index; it does not affect this spec's archive/unarchive endpoints directly.

14. Archiving an article has no effect on any journal entry or annotation that references it. `content/articles/<articleId>.json` remains fetchable directly by `articleId` regardless of archive state, so past journal entries and direct links to `/articles/<articleId>` continue to render the article and its notes normally.

15. The dashboard, past-entry views, and any other place that links to an article via `contentRef`/`articleId` are unaffected by archive state — they are out of scope for this spec's filtering behavior (see Out of Scope).

16. Client-side search on Browse Articles (existing feature) operates within the current view only — searching while "Show archived" is off searches non-archived articles; searching while on searches archived articles. Search does not span both sets at once in this spec.

---

## Error States & Edge Cases

| Scenario | What Happens |
|----------|-------------|
| Archive request for an `articleId` with no matching index entry (e.g. article was imported before archive support and index write previously failed, or `articleId` does not exist) | `404 Not Found` — `{ error: "NOT_FOUND", message: "Article not found in index" }` |
| Archive request for an `articleId` that is not the *current* version's id for its source URL (an older version) | `404 Not Found` — the index only tracks the latest version per source URL; older-version ids are not archivable/unarchivable directly |
| Archive endpoint called on an article already `archived: true` | Idempotent success — `200 OK`, index unchanged (no duplicate invalidation required, but a no-op write is acceptable) |
| Unarchive endpoint called on an article already `archived: false` | Idempotent success — `200 OK`, index unchanged |
| Unauthenticated request to archive/unarchive endpoints | `401 Unauthorized` |
| Index write conflict (412) on all 3 retries | `409 Conflict` — `{ error: "WRITE_CONFLICT", message: "Could not update the article index. Please try again." }` (matches the existing convention in `handler/annotation.ts`); article's archive state is unchanged; UI shows an inline error, card/button state is unaffected since nothing changed before the server confirmed |
| Network failure calling archive/unarchive from the UI | No premature UI change to undo — the card/button state never changes until the mutation resolves. An inline error appears: "Could not archive article. Try again." (or "Could not unarchive...") |
| `content/articles/index.json` does not exist yet (no articles imported) | Archive/unarchive endpoints return `404 Not Found` as above; Browse Articles empty state is unaffected (see browse-articles spec) |
| "Show archived" toggle is on and there are zero archived articles | Grid shows an empty state: "No archived articles." |
| Two simultaneous archive/unarchive calls for different articles | Each request reads and writes the index independently with `If-Match`/retry; both eventually succeed per the existing conflict-retry pattern |
| Two simultaneous archive calls for the *same* article | One wins the conditional write; the other retries, re-reads (now `archived: true`), and its write is a no-op — both requests return `200 OK` |

---

## Data Model

### `ArticleIndexEntry` — change to existing type in `content/articles/index.json`

| Field | Type | Required | Validation | Notes |
|-------|------|----------|------------|-------|
| `articleId` | `string` | Yes | 64-char lowercase hex | unchanged |
| `title` | `string` | Yes | non-empty | unchanged |
| `sourceUrl` | `string` | Yes | valid HTTPS URL | unchanged |
| `importedAt` | `string` | Yes | ISO 8601 datetime | unchanged |
| `archived` | `boolean` | Yes | — | **new**. Defaults to `false` on import. Toggled by the archive/unarchive endpoints. |

Migration note: any existing `content/articles/index.json` entries written before this feature lack `archived`. The read path (index fetch in Browse Articles and in the archive/unarchive handlers) must treat a missing `archived` field as `false` (non-archived) rather than failing validation, since the index is not backfilled retroactively.

No changes to `Article` (`content/articles/<articleId>.json`) or `ArticleUrlIndex`.

---

## API Contract

### POST `/articles/:articleId/archive`

**Auth required**: Yes
**Description**: Marks the index entry for the given article's source URL as archived.

**Request**:
```typescript
// Path params
{ articleId: string } // 64-char lowercase hex

// Body: none
```

**Response — 200 OK**:
```typescript
{
  data: {
    articleId: string;
    archived: true;
  }
}
```

**Response — 404 Not Found**:
```typescript
{ error: "NOT_FOUND"; message: "Article not found in index" }
```

**Response — 401 Unauthorized**:
```typescript
{ error: "UNAUTHORIZED"; message: "Authentication required" }
```

**Response — 409 Conflict**:
```typescript
{ error: "WRITE_CONFLICT"; message: "Could not update the article index. Please try again." }
```

### POST `/articles/:articleId/unarchive`

**Auth required**: Yes
**Description**: Marks the index entry for the given article's source URL as not archived.

**Request**:
```typescript
// Path params
{ articleId: string } // 64-char lowercase hex

// Body: none
```

**Response — 200 OK**:
```typescript
{
  data: {
    articleId: string;
    archived: false;
  }
}
```

**Response — 404 Not Found**: same shape as archive endpoint.
**Response — 401 Unauthorized**: same shape as archive endpoint.
**Response — 409 Conflict**: same shape as archive endpoint.

### `GET content/articles/index.json` (CloudFront/S3, no Lambda) — unchanged endpoint, extended shape

**Auth required**: No
**200 OK**:
```typescript
interface ArticleIndex {
  articles: Array<{
    articleId: string;
    title: string;
    sourceUrl: string;
    importedAt: string;
    archived: boolean; // new; treat missing as false client-side
  }>;
}
```

---

## Acceptance Criteria

### Happy Path — Archiving

- [ ] From an article card's overflow menu on `/articles`, clicking "Archive" removes the card from the (default, non-archived) grid without a page reload.
- [ ] From the article view page (`/articles/<articleId>`), clicking "Archive" updates the action button to "Unarchive" in place, without navigating away.
- [ ] After archiving, `content/articles/index.json`'s entry for that article has `archived: true`.
- [ ] After archiving, a CloudFront invalidation is issued for `/content/articles/index.json`.
- [ ] Archiving requires no confirmation dialog — the action completes immediately on click.

### Happy Path — Unarchiving

- [ ] With "Show archived" on, clicking "Unarchive" on an archived card removes it from the archived grid.
- [ ] From the article view page, clicking "Unarchive" on an archived article updates the button back to "Archive" in place.
- [ ] After unarchiving, the article reappears in the default (non-archived) Browse Articles grid on next load.
- [ ] Unarchiving requires no confirmation dialog.

### Show Archived Toggle

- [ ] Browse Articles has a "Show archived" toggle, off by default.
- [ ] With the toggle off, only non-archived articles appear in the grid.
- [ ] With the toggle on, only archived articles appear in the grid.
- [ ] Toggling does not mix archived and non-archived cards in one view.
- [ ] With the toggle on and zero archived articles, the page shows "No archived articles."

### Data Preservation

- [ ] After archiving an article, `content/articles/<articleId>.json` is unchanged and still fetchable directly.
- [ ] After archiving an article, a past journal entry that references it (via `contentRef`) still renders the article and its annotations normally when viewed from the dashboard/past-entry view.
- [ ] After archiving an article, navigating directly to `/articles/<articleId>` still renders the full article and any existing annotations.
- [ ] Unarchiving an article does not alter `importedAt`, `title`, `sourceUrl`, or any annotation/entry data.

### Error Handling

- [ ] Archiving an `articleId` with no matching index entry returns 404 and the UI shows an inline error without crashing.
- [ ] An unauthenticated archive/unarchive request returns 401.
- [ ] A network failure during archive/unarchive leaves the card/button state unchanged (no premature UI change was made) and shows an inline error.
- [ ] Calling archive on an already-archived article returns 200 and leaves state unchanged (idempotent).
- [ ] Calling unarchive on an already-unarchived article returns 200 and leaves state unchanged (idempotent).

### Edge Cases

- [ ] Search on Browse Articles, while "Show archived" is off, only matches against non-archived cards.
- [ ] Search on Browse Articles, while "Show archived" is on, only matches against archived cards.
- [ ] An `content/articles/index.json` entry written before this feature (missing `archived`) is treated as non-archived and appears in the default grid, not the archived one.
- [ ] Importing a new version (`VERSION_IMPORTED`) for a source URL that was archived results in the new index entry being `archived: false`.

---

## Non-Functional Requirements

- **Performance**: The archive/unarchive Lambda call follows the same latency budget as other index-mutating operations in article-import (index read + conditional write + invalidation); the UI reflects the change as soon as the mutation resolves and the article index query refetches.
- **Security**: Archive/unarchive endpoints require authentication, matching the "write endpoints require auth by default" rule in the constitution. No new PII is introduced (archive state is a boolean).
- **Cost**: No new persistent infrastructure. One additional CloudFront invalidation per archive/unarchive action, same cost profile as import's existing index invalidation.
- **Consistency**: Archive state is eventually consistent with the same bound as the existing index (bounded by CloudFront invalidation propagation, typically seconds).

---

## Out of Scope

- Full-text or metadata search across articles (mentioned by the user as a future feature); this spec only ensures archived articles remain data-intact and index-visible enough to support it later.
- Deleting an article's content or annotations outright — this spec is additive to, not a replacement for, deletion (deletion is not addressed at all).
- Archiving/unarchiving in bulk (multi-select on Browse Articles).
- Per-user archive state — archive state lives on the shared `ArticleIndex`, consistent with `Article.scope: "shared"`; there is currently one Reader, so a shared flag is sufficient. Multi-user private archiving is not addressed.
- Any change to how the dashboard, calendar view, or past-entry pages display or filter entries referencing archived articles — they are unaffected and unfiltered by archive state.
- Auto-archiving (e.g. by age or inactivity).
- Showing archive state or an archive action on the scripture browsing pages — this spec covers articles only.

---

## Open Questions

None — all ambiguous points were resolved with the user before drafting (see decisions folded into Functional Requirements 2, 7, 9–10, 16).
