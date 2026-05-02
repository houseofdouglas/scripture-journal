# Acceptance Report: Browse Articles

**Date**: 2026-05-02
**Result**: FAIL — implementation not yet started (all 7 tasks PENDING)

---

## Summary

20 criteria checked. 0 passing, 0 partial, 20 failing.

All criteria fail because no implementation tasks have been completed. The spec and task plan were authored today; this report establishes the baseline to re-check against after the tasks are complete.

---

## Criteria Results

### Navigation & Page Load

#### ❌ FAIL — "Browse Articles" link appears in the top nav alongside "Browse Scripture" and "Import Article"
**Reason**: `Nav.tsx` has no Browse Articles link. Only "Browse Scripture" and "Import Article" are present.
**Required**: BA-07 — add `<NavLink to="/articles">Browse Articles</NavLink>` to `Nav.tsx`

#### ❌ FAIL — Link is highlighted as active when the current route is `/articles`
**Reason**: Nav links use plain `<Link>`, not `<NavLink>`. No active-state styling exists for any nav link.
**Required**: BA-07 — convert Nav links to `<NavLink>` with active `className` callback

#### ❌ FAIL — Navigating to `/articles` renders the page without a full-page reload (SPA navigation)
**Reason**: No `/articles` route registered in `main.tsx`. The path is unmatched — React Router renders nothing.
**Required**: BA-07 — add `<Route path="/articles" element={<ProtectedRoute><ArticleBrowserPage /></ProtectedRoute>} />`

#### ❌ FAIL — A loading skeleton is visible while `content/articles/index.json` is fetching
**Reason**: `ArticleBrowserPage` does not exist.
**Required**: BA-07 — implement loading skeleton in `ArticleBrowserPage`

---

### Article List

#### ❌ FAIL — Page displays one card per source URL (latest version only)
**Reason**: No `ArticleBrowserPage`, no `useArticleIndex` hook, no `ArticleIndex` type.
**Required**: BA-01 (types) → BA-06 (query hook) → BA-07 (page)

#### ❌ FAIL — Cards are ordered newest `importedAt` first
**Reason**: No page, and no `ArticleIndex` maintained in the backend.
**Required**: BA-04 (index pre-sorted at write time) + BA-07 (client renders in array order)

#### ❌ FAIL — Each card shows title, source domain (not full URL), and import date formatted as `MMM D, YYYY`
**Reason**: No card component exists.
**Required**: BA-07 — card rendering in `ArticleBrowserPage`

#### ❌ FAIL — Clicking a card navigates to `/articles/<articleId>`
**Reason**: No page or cards.
**Required**: BA-07

---

### Empty State

#### ❌ FAIL — Given no articles, page displays "No articles imported yet." and a link to `/import`
**Reason**: No page.
**Required**: BA-07 — empty state branch in `ArticleBrowserPage`

#### ❌ FAIL — Clicking the empty-state link navigates to `/import`
**Reason**: No page.
**Required**: BA-07

---

### Search

#### ❌ FAIL — A search input is rendered above the card grid
**Reason**: No page.
**Required**: BA-07

#### ❌ FAIL — Typing in the search input filters cards in real time
**Reason**: No page.
**Required**: BA-07

#### ❌ FAIL — Filter matches against title and full source URL, case-insensitively
**Reason**: No page.
**Required**: BA-07

#### ❌ FAIL — Clearing the search input restores the full card list
**Reason**: No page.
**Required**: BA-07

#### ❌ FAIL — When no cards match the query, "No articles match your search." is displayed
**Reason**: No page.
**Required**: BA-07

---

### Article Index — Import Integration

#### ❌ FAIL — After a successful `IMPORTED` import, the new article appears in Browse Articles on the next page load
**Reason**: `writeArticle()` in `article-import.ts` does not call `updateArticleIndex`. No `ArticleIndex` schema, repository function, or CloudFront invalidation exists.
**Required**: BA-01 → BA-02 → BA-03 → BA-04

#### ❌ FAIL — After `VERSION_IMPORTED`, Browse Articles shows the new version's card and the old version's card is gone
**Reason**: Same — `writeArticle()` has no index maintenance. The upsert-by-sourceUrl logic is not implemented.
**Required**: BA-01 → BA-02 → BA-03 → BA-04

#### ❌ FAIL — Two simultaneously imported articles both eventually appear in the index (retry loop resolves the conflict)
**Reason**: No `updateArticleIndex` conditional-write-with-retry exists.
**Required**: BA-02 (`conditionalWrite` wrapper), BA-04 (called from service), BA-05 (test coverage)

---

### Error Handling

#### ❌ FAIL — If `index.json` fails to fetch, an inline error message and Retry button appear
**Reason**: No page.
**Required**: BA-07 — error state branch in `ArticleBrowserPage`

---

### Non-Functional

#### ❌ FAIL — `tsc --noEmit` passes for all new code
**Reason**: No new code has been written yet — this criterion will be validated per-task as implementation proceeds.
**Required**: All tasks (BA-01 through BA-07)

---

## Task → Criterion Map

| Task | Unblocks criteria |
|------|-------------------|
| BA-01 Types | ArticleIndex schema enables all backend and query work |
| BA-02 Repository | Index read/write for import integration (3 criteria) |
| BA-03 Infra | CloudFront invalidation for immediate post-import freshness |
| BA-04 Service | Import integration: IMPORTED, VERSION_IMPORTED, concurrency (3 criteria) |
| BA-05 Tests | Test coverage criterion |
| BA-06 UI Query | Unblocks all page rendering criteria |
| BA-07 UI Page + Nav + Route | 14 UI criteria |
