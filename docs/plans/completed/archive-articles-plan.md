# Execution Plan: Archive Articles

**Started**: 2026-07-03
**Status**: DONE — all 10 tasks complete; spec acceptance PASS (27/27).
**Spec**: [docs/specs/archive-articles.md](../../specs/archive-articles.md)
**Tasks**: [docs/tasks/archive-articles-tasks.md](../../tasks/archive-articles-tasks.md)
**Acceptance Report**: [../completed/archive-articles-acceptance-2026-07-03.md](../completed/archive-articles-acceptance-2026-07-03.md) — PASS (27/27, 0 partial, 0 fail) after closing 8 initial gaps

## Progress

- [x] AA-01 — Types: `archived` field on `ArticleIndexEntry`
- [x] AA-02 — Repository: `setArticleArchived`
- [x] AA-03 — Service: `archiveArticle` / `unarchiveArticle`
- [x] AA-04 — Handler: archive/unarchive routes
- [x] AA-05 — Tests: repository, service, handler coverage (folded into AA-02/03/04)
- [x] AA-06 — UI: archive/unarchive mutation hooks
- [x] AA-07 — UI: Browse Articles — "Show archived" toggle + card action
- [x] AA-08 — UI: Article view page — Archive/Unarchive button
- [x] AA-09 — Tests: UI unit coverage for toggle and archive actions
- [x] AA-10 — E2E: archive/unarchive flow

## Dependency Map

```
AA-01 → AA-02 → AA-03 → AA-04 → AA-05
                          AA-04 → AA-06 → AA-07 → AA-09 → AA-10
                                       └→ AA-08 ↗        ↗
```

AA-05 (backend tests) can run in parallel with AA-06 once AA-04 lands. AA-09/AA-10 need both AA-07 and AA-08 done.

## Decisions & Notes

- Write-conflict error code aligned to the codebase's existing `409 WRITE_CONFLICT` convention (from `handler/annotation.ts`) rather than the `503` originally drafted in the spec — spec updated accordingly before task planning.
- AA-01: `archived` uses `z.boolean().default(false)`, making it a required field on the inferred `ArticleIndexEntry` output type. This forced a one-line fix in `article-import.ts`'s `writeArticle()` (new entries now set `archived: false` explicitly) plus test fixture updates in `article-index.test.ts` and `article-import.test.ts` — expected ripple from adding a required field to a shared type, not scope creep.
- AA-03: `archiveArticle`/`unarchiveArticle` pass a fresh `crypto.randomUUID()` as the CloudFront `CallerReference` on each call, rather than reusing `articleId` (as `writeArticle` does for imports). Reusing `articleId` would be safe for imports (each write gets a new content-addressed id) but not for archive toggles, since the same article can be archived/unarchived repeatedly — CloudFront treats an identical `CallerReference` + parameters as idempotent and would silently skip creating a new invalidation on the second toggle, leaving a stale cached index.
- AA-05 (backend test task) was completed inline during AA-02/AA-03/AA-04 rather than as its own pass — this `/next-task` workflow writes tests alongside each layer's implementation, so by the time AA-04 landed, all of AA-05's planned coverage already existed. Marked DONE with a note rather than re-doing the work. Coverage-percentage tooling (`@vitest/coverage-v8`) isn't installed in this repo, so the constitution's 80% line-coverage requirement was checked qualitatively (every branch of `setArticleArchived`/`archiveArticle`/`unarchiveArticle`/both routes is exercised) rather than measured — flagged, not silently assumed.
- AA-06 test setup gap found and fixed: this is the first test in the repo to exercise a code path (`apiClient`) that reads `localStorage` under the `jsdom` Vitest environment. Node 22's experimental global `localStorage` shadows jsdom's and isn't a working `Storage` object without `--localstorage-file`, causing `localStorage.getItem is not a function`. Stubbed `localStorage` directly in `articles.test.ts` (`vi.stubGlobal`) rather than changing global Vitest config — scoped fix, but worth knowing this will recur for any future test that touches `apiClient` or the `*-context.tsx` files under jsdom.
- AA-07: turned each card from a single `<button>` into a `<div role="button" tabIndex={0}>` (with onClick/onKeyDown for Enter/Space) so the per-card Archive/Unarchive action could be a real nested `<button>` with `stopPropagation()` — a button can't nest inside a button (invalid HTML) once a second interactive action is needed on the same card. No separate optimistic-hide state was added: because `useArchiveArticle`/`useUnarchiveArticle` invalidate `["articles","index"]` on success, the existing `a.archived === showArchived` filter naturally drops the card once refetch lands, without extra client state.
- AA-07 was manually verified in the browser (not automated): the repo's `dev:api` server proxies straight to a real S3 bucket/CloudFront distribution (per `.env.local`), so running the full stack would perform real S3 writes and billed CloudFront invalidations against live content. Verified instead against the Vite-only server with `window.fetch` stubbed in-browser (canned `ArticleIndex` + archive/unarchive responses) — confirmed toggle, per-card action, empty state, dark mode, and mobile layout all work; no real AWS calls were made. Automated coverage is still owed via AA-09.
- AA-08: the button uses `useArticleIndex()` (not a per-article "is this archived" endpoint) to derive archive state via the AA-06 `isArticleArchived` selector — reuses the already-cached index query rather than adding a new lookup. Verified the same way as AA-07 (Vite-only server, `window.fetch` stubbed) via SPA client-side navigation (Browse Articles → card click) so the in-browser fetch stub survived across the route change; toggling the button flips label in place, doesn't navigate, and preserves the paragraph/annotation content underneath. Automated tests still owed via AA-09, which is now unblocked (both AA-07 and AA-08 are done).
- AA-09: these are the first `.test.tsx` component tests in the repo, which surfaced two setup gaps — (1) no `@testing-library/jest-dom` installed, so `toBeInTheDocument()` isn't available; used plain Vitest matchers (`toBeTruthy()`/`toBeNull()`) instead of adding a new dependency. (2) no `afterEach(cleanup)` anywhere, so renders leaked across tests within a file and broke `getByRole`/`getByText` queries with "multiple elements found"; added `afterEach(cleanup)` locally in both new test files (not in the shared `src/__tests__/setup.ts`, since that setup file runs for `environment: "node"` backend tests too, where `document` doesn't exist and `cleanup()` would throw). Both hooks (`useArticleIndex`/`useArchiveArticle`/`useUnarchiveArticle`) and `useAnnotationEditor` are mocked at the module level; `ArticleViewPage`'s own article-fetch `useQuery` is left real, fed via `queryClient.setQueryData` (staleTime: Infinity means no network call fires).
- Post-AA-09: `/check-acceptance` found 8 PARTIALs (all test-coverage gaps, no broken functionality — see the 2026-07-03 acceptance report). Closed all 8: added 2 idempotency tests + 2 unchanged-fields assertions to `article-index.test.ts`, corrected the VERSION_IMPORTED test in `article-import.test.ts` to use a previously-archived fixture, and added 5 tests to `ArticleBrowserPage.test.tsx` (error banners ×2, search+toggle scoping ×2, plus the pre-existing count). Also corrected `archive-articles.md` itself — FR-8/FR-9, the Error States table, one acceptance criterion, and the Performance NFR described a manual "optimistic UI update + rollback" that was never built; reworded to describe the actual invalidate-then-refetch mechanism (no premature UI change, so nothing to roll back). Suite grew 116 → 122; re-run of `/check-acceptance` is now PASS (27/27).
- AA-10 uncovered a real accessibility bug, not just a test-tooling quirk: `ArticleGrid`'s card `<div role="button">` had no explicit `aria-label`, so its computed accessible name aggregated ALL descendant text — including the nested "Archive"/"Unarchive" button's own label (e.g. "Archive Faith in Jesus Christ churchofjesuschrist.org Apr 22, 2026"). `page.getByRole("button", { name: "Archive" })` matches by substring by default, so it ambiguously matched both the card and the real button, and `.first()` picked the outer card — clicking it navigated to the article instead of archiving. Fixed by adding `aria-label={`Open article: ${article.title}`}` to the card div, which overrides the content-derived name (explicit `aria-label` takes precedence in ARIA accessible-name computation). This also fixes the real screen-reader experience, which had the same ambiguity. Root-caused via a throwaway debug Playwright spec that logged the matched button's bounding box (277×114 — clearly the whole card, not a small corner button).
