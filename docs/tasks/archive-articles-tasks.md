# Tasks: Archive Articles

**Spec**: [docs/specs/archive-articles.md](../specs/archive-articles.md)
**Created**: 2026-07-03
**Status**: PENDING

---

## Task: AA-01 — Types: `archived` field on `ArticleIndexEntry`

**Layer**: Types
**Estimate**: 30min
**Depends on**: none
**Status**: DONE
**Completed**: 2026-07-03

### What to build
Add `archived: z.boolean().default(false)` to `ArticleIndexEntrySchema` in `src/types/article.ts`. Using `.default(false)` (not `.optional()`) means `ArticleIndexEntrySchema.parse()` normalizes any pre-existing index entry that lacks the field to `archived: false` at read time — satisfying the spec's migration note without a separate backfill step.

### Acceptance criteria
- [ ] Parsing an entry object with no `archived` key yields `archived: false`
- [ ] Parsing an entry with `archived: true` preserves it
- [ ] `tsc --noEmit` passes

### Files expected
- `src/types/article.ts` — add `archived` field to `ArticleIndexEntrySchema`

---

## Task: AA-02 — Repository: `setArticleArchived`

**Layer**: Repository
**Estimate**: 1hr
**Depends on**: AA-01
**Status**: DONE
**Completed**: 2026-07-03

### What to build
Add `setArticleArchived(articleId: string, archived: boolean): Promise<boolean>` to `src/repository/article.ts`. Uses the existing `updateArticleIndex` (read-modify-write via `conditionalWrite`, already retrying up to 3× on 412). Inside the mutator, find the entry where `articleId` matches; if found, return a new `articles[]` with that entry's `archived` flag set and record `found = true` in an outer closure variable; if not found, return `current` unchanged and record `found = false`. Return the closure variable after the write completes.

### Acceptance criteria
- [ ] Returns `true` and persists the new `archived` value when the `articleId` matches an index entry
- [ ] Returns `false` and performs no meaningful mutation when no entry matches that `articleId` (e.g. an older version's id)
- [ ] Retries on 412 via the existing `conditionalWrite`/`updateArticleIndex` plumbing (no new retry logic written)
- [ ] `tsc --noEmit` passes

### Files expected
- `src/repository/article.ts` — add `setArticleArchived`

---

## Task: AA-03 — Service: `archiveArticle` / `unarchiveArticle`

**Layer**: Service
**Estimate**: 1hr
**Depends on**: AA-02
**Status**: DONE
**Completed**: 2026-07-03

### What to build
Add two functions to `src/service/article-import.ts` (co-located with `writeArticle`/`invalidateArticleIndex`, which they reuse):

```typescript
export async function archiveArticle(articleId: string): Promise<{ articleId: string; archived: true } | null>
export async function unarchiveArticle(articleId: string): Promise<{ articleId: string; archived: false } | null>
```

Each calls `setArticleArchived(articleId, true|false)`; returns `null` if it returned `false` (not found); otherwise calls the existing `invalidateArticleIndex(articleId)` helper and returns `{ articleId, archived }`. `WriteConflictError` from `conditionalWrite` propagates unhandled — the handler catches it (AA-04).

### Acceptance criteria
- [ ] `archiveArticle`/`unarchiveArticle` return `null` when the article isn't in the index (no invalidation issued)
- [ ] On success, `invalidateArticleIndex` is called with the article index path
- [ ] `WriteConflictError` from the repository propagates to the caller unmodified
- [ ] `tsc --noEmit` passes

### Files expected
- `src/service/article-import.ts` — add `archiveArticle`, `unarchiveArticle`

---

## Task: AA-04 — Handler: archive/unarchive routes

**Layer**: Handler
**Estimate**: 1hr
**Depends on**: AA-03
**Status**: DONE
**Completed**: 2026-07-03

### What to build
Add two routes to `src/handler/article.ts`:
- `POST /articles/:articleId/archive` → calls `archiveArticle`
- `POST /articles/:articleId/unarchive` → calls `unarchiveArticle`

Auth is already enforced globally by the JWT middleware in `app.ts` (no per-route auth code needed). Map `null` result → `404 { error: "NOT_FOUND", message: "Article not found in index" }`; catch `WriteConflictError` (from `repository/errors`) → `409 { error: "WRITE_CONFLICT", message: "Could not update the article index. Please try again." }` (same pattern as `handler/annotation.ts`); success → `200 { data: { articleId, archived } }`.

### Acceptance criteria
- [ ] `POST /articles/:articleId/archive` returns `200` with `{ data: { articleId, archived: true } }` on success
- [ ] `POST /articles/:articleId/unarchive` returns `200` with `{ data: { articleId, archived: false } }` on success
- [ ] Both return `404 NOT_FOUND` when `articleId` has no matching index entry
- [ ] Both return `409 WRITE_CONFLICT` on persistent 412 conflict
- [ ] Both return `401` when called without a valid JWT (verify via existing global middleware, no new code)
- [ ] `tsc --noEmit` passes

### Files expected
- `src/handler/article.ts` — add archive/unarchive routes

---

## Task: AA-05 — Tests: repository, service, handler coverage

**Layer**: Test
**Estimate**: 1.5hr
**Depends on**: AA-04
**Status**: DONE
**Completed**: 2026-07-03 (folded into AA-02/AA-03/AA-04 — tests were written alongside each layer's implementation rather than as a trailing task; see plan notes)

### What to build
Extend `src/repository/__tests__/article-index.test.ts`, `src/service/__tests__/article-import.test.ts`, and `src/handler/__tests__/article.test.ts` with cases for: found/not-found archive+unarchive at the repository level; null-return and invalidation-call behavior at the service level; and all four HTTP response shapes (200/404/409/401) at the handler level. Mirrors the structure of `BA-05` in `docs/tasks/browse-articles-tasks.md`.

### Acceptance criteria
- [ ] All new cases pass under `vitest`
- [ ] No existing tests broken
- [ ] Service layer coverage remains ≥ 80% lines (constitution requirement)

### Files expected
- `src/repository/__tests__/article-index.test.ts` — archive/unarchive cases
- `src/service/__tests__/article-import.test.ts` — archive/unarchive cases
- `src/handler/__tests__/article.test.ts` — archive/unarchive route cases

---

## Task: AA-06 — UI: archive/unarchive mutation hooks

**Layer**: UI
**Estimate**: 1hr
**Depends on**: AA-04
**Status**: DONE
**Completed**: 2026-07-03

### What to build
Add `useArchiveArticle()` and `useUnarchiveArticle()` to `src/ui/lib/queries/articles.ts`, following the `useMutation` + `apiClient.post` + `invalidateQueries(["articles", "index"])` pattern already used by `useCreateProject` in `src/ui/lib/queries/projects.ts`. Also add a small selector helper (e.g. `isArticleArchived(index, articleId)`) used by both AA-07 and AA-08 to avoid duplicating the `articles.find(...)` lookup.

### Acceptance criteria
- [ ] `useArchiveArticle().mutate(articleId)` posts to `/articles/:articleId/archive` and invalidates the `["articles", "index"]` query on success
- [ ] `useUnarchiveArticle()` mirrors this for `/unarchive`
- [ ] `tsc --noEmit` passes

### Files expected
- `src/ui/lib/queries/articles.ts` — add mutation hooks + selector helper

---

## Task: AA-07 — UI: Browse Articles — "Show archived" toggle + card action

**Layer**: UI
**Estimate**: 2hr
**Depends on**: AA-06
**Status**: DONE
**Completed**: 2026-07-03 (automated tests deferred to AA-09, which pairs this with AA-08; manually verified in browser preview — see plan notes)

### What to build
In `src/ui/pages/ArticleBrowserPage.tsx`: add a toggle (default off) that switches the grid between `articles.filter(a => !a.archived)` and `articles.filter(a => a.archived)` — never both. Add an overflow/kebab menu to each `ArticleGrid` card with "Archive" (non-archived view) or "Unarchive" (archived view), wired to the AA-06 hooks; on click, `stopPropagation` so it doesn't trigger card navigation, and don't require a confirm dialog (per spec FR-10). Add an archived-empty state: "No archived articles." Search continues to filter only within the currently active (archived vs. non-archived) set.

### Acceptance criteria
- [ ] Toggle defaults off; grid shows only non-archived cards
- [ ] Toggling on shows only archived cards; toggling off restores non-archived
- [ ] Clicking "Archive"/"Unarchive" on a card does not navigate to the article
- [ ] On success, the card is removed from the current grid (via query invalidation/refetch)
- [ ] Archived view with zero results shows "No archived articles."
- [ ] Search matches only within the currently shown (archived or non-archived) set
- [ ] `tsc --noEmit` passes

### Files expected
- `src/ui/pages/ArticleBrowserPage.tsx` — toggle, card action menu, archived empty state

---

## Task: AA-08 — UI: Article view page — Archive/Unarchive button

**Layer**: UI
**Estimate**: 1hr
**Depends on**: AA-06
**Status**: DONE
**Completed**: 2026-07-03 (automated tests deferred to AA-09; manually verified in browser preview — see plan notes)

### What to build
In `src/ui/pages/ArticleViewPage.tsx`: call `useArticleIndex()` (already cached from Browse Articles in most flows; cheap if not) to look up this article's `archived` state via the AA-06 selector helper. Render an "Archive" button when not archived, "Unarchive" when archived, near the existing source-link/imported-date row. Wire to the AA-06 mutation hooks; no confirmation dialog; button reflects new state in place without navigation.

### Acceptance criteria
- [ ] Button shows "Archive" for a non-archived article, "Unarchive" for an archived one
- [ ] Clicking updates the button label in place after success, without leaving the page
- [ ] Works correctly even when the article isn't yet in the client's index cache (index is fetched fresh via `useArticleIndex`)
- [ ] `tsc --noEmit` passes

### Files expected
- `src/ui/pages/ArticleViewPage.tsx` — Archive/Unarchive button

---

## Task: AA-09 — Tests: UI unit coverage for toggle and archive actions

**Layer**: Test
**Estimate**: 1hr
**Depends on**: AA-07, AA-08
**Status**: DONE
**Completed**: 2026-07-03

### What to build
Add/extend Testing Library tests for `ArticleBrowserPage` (toggle behavior, card action, empty archived state) and `ArticleViewPage` (button state + click flow), mocking the AA-06 hooks/`apiClient`.

### Acceptance criteria
- [ ] All new cases pass under `vitest`
- [ ] No existing tests broken

### Files expected
- `src/ui/pages/__tests__/ArticleBrowserPage.test.tsx` — new or extended
- `src/ui/pages/__tests__/ArticleViewPage.test.tsx` — new or extended

---

## Task: AA-10 — E2E: archive/unarchive flow

**Layer**: Test
**Estimate**: 1.5hr
**Depends on**: AA-07, AA-08
**Status**: DONE
**Completed**: 2026-07-03

### What to build
Add a new `e2e/archive-articles.spec.ts` (mirroring `e2e/article-import.spec.ts` conventions) using `e2e/helpers/mocks.ts` and `e2e/helpers/auth.ts`. Cover: archiving from a Browse Articles card removes it from the default grid; toggling "Show archived" reveals it; unarchiving from the archived view restores it to default; archiving from the article view page updates the button in place; a past journal entry linking to an archived article still renders normally.

### Acceptance criteria
- [ ] All new Playwright specs pass
- [ ] No existing e2e specs broken

### Files expected
- `e2e/archive-articles.spec.ts` — new
- `e2e/helpers/mocks.ts` — add archive/unarchive mock helpers if needed
