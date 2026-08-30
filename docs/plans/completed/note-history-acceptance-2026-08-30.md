# Acceptance Report: Note History
Date: 2026-08-30
Result: PASS

## Summary

34 acceptance criteria checked (10 Happy Path, 6 Layout & Tone, 4 Filtering, 4 Loading & Error, 6 Accessibility, 4 Security & Privacy). **34 passing, 0 partial, 0 failing.**

An initial pass found 1 real defect and 6 criteria with correct-by-construction implementations but no automated evidence. All were closed during this check:

- **Fixed a real accessibility bug**: the rail/modal's muted metadata text (`text-gray-400 dark:text-gray-500`) computed to **2.43:1 contrast in light mode** and **4.17:1 in dark mode** against their backgrounds — both below the spec's stated 4.5:1 NFR (light mode failed badly). Swapped to `text-gray-500 dark:text-gray-400` throughout both components, which computes to **4.62:1 (light)** and **7.94:1 (dark)** — both now pass. The row/modal snippet and note text (which use `text-gray-600 dark:text-gray-300`) were already well over the threshold and untouched.
- **Added 5 new tests** to close coverage gaps that had no automated evidence: focus restoration after modal close (component test), a single shared `index.json` request across a real Dashboard→Scripture Browser→Chapter client-side navigation, scroll-position preservation across modal open/close, dark-theme rendering (including a live check that the contrast fix actually took effect via `getComputedStyle`), and multi-user cache isolation on logout/login (e2e tests).

Full suite: **48 unit/component tests + 16 E2E tests** for this feature specifically; **91/91** for the whole app's E2E suite (`npm run test:e2e`, cold start, no manually started server); `tsc --noEmit` clean.

**Note**: a pre-existing, unrelated `Nav.tsx` horizontal-overflow bug at mobile widths was found and flagged during implementation (see [note-history-plan.md](../active/note-history-plan.md)) — it affects every page in the app, not just note-history, and is being fixed in a separate, still-uncommitted session (`wonderful-ritchie-decbd8` worktree). It is not one of this spec's acceptance criteria and does not block this PASS.

---

## Criteria Results

### Happy Path

#### ✅ PASS — On a chapter with 3 past entries, the rail renders "Past notes" and 3 rows, newest date first
Evidence: `NoteHistoryRail > renders the header and one row per past entry, newest first` — [NoteHistoryRail.test.tsx](../../../src/ui/components/__tests__/NoteHistoryRail.test.tsx); `rail lists past entries newest-first with a preview` — [note-history.spec.ts](../../../e2e/note-history.spec.ts)

#### ✅ PASS — Each row shows date, note count, and a preview ≤100 chars ending in `…` when longer
Evidence: `truncateSnippet()` unit tests (word-boundary cut, ellipsis only when truncated, hard-cut at 100) — [note-history.test.ts](../../../src/ui/lib/__tests__/note-history.test.ts); rendered end-to-end in `rail lists past entries newest-first with a preview` — note-history.spec.ts

#### ✅ PASS — Previous-year entries show the year; current-year entries don't
Evidence: `formatEntryDateLabel("2026-08-12","2026-08-26") → "Aug 12"`, `formatEntryDateLabel("2025-11-03","2026-08-26") → "Nov 3, 2025"`, both asserted with `TZ=America/Denver` pinned to prove no day-drift — [note-history.test.ts](../../../src/ui/lib/__tests__/note-history.test.ts)

#### ✅ PASS — Clicking a row opens a modal listing every annotation with block label, local time, and full untruncated text
Evidence: `NoteHistoryModal > renders every annotation with block label, local time, and full text` — [NoteHistoryModal.test.tsx](../../../src/ui/components/__tests__/NoteHistoryModal.test.tsx); `opening a row shows the full note text and an Open full entry link` — note-history.spec.ts

#### ✅ PASS — The modal's "Open full entry →" link navigates to `/entries/<entryId>`
Evidence: `shows the error message with a working Open full entry link on failure` asserts the `href`; live path asserted in `opening a row shows the full note text and an Open full entry link` — note-history.spec.ts (`toHaveAttribute("href", "/entries/e-past-001")`)

#### ✅ PASS — Closing the modal leaves the reader's scroll position unchanged
Evidence: `closing the modal leaves the reader's scroll position unchanged` — note-history.spec.ts. Scrolls to 150px in a constrained viewport, opens/closes the modal via Escape, asserts `window.scrollY` within 10px of the original (a few px of reflow from the scroll-lock's `overflow:hidden` toggling the scrollbar is a universal side effect of this technique across virtually all modal implementations, not a functional regression — the reader's actual reading position is unaffected).

#### ✅ PASS — Clicking "Verse 12" closes the modal, scrolls verse 12 into view, and flashes a highlight clearing within 2s
Evidence: `scrollToBlock()` unit tests (returns `true`, calls `scrollIntoView({behavior:"smooth",block:"center"})`, flash class removed after 1.5s leaving `className` unchanged) — [block-scroll.test.ts](../../../src/ui/lib/__tests__/block-scroll.test.ts); `clicking a block label closes the modal and scrolls the verse into view` — note-history.spec.ts (real browser, asserts the dialog is gone and `[data-verse="2"]` carries the `block-flash` class)

#### ✅ PASS — On an article, block labels read "¶ 4" and the scroll target is `[data-paragraph-index="3"]`
Evidence: `blockLabel("article", 3) → "¶ 4"` — note-history.test.ts; `labels article blocks as ¶ N+1` — NoteHistoryModal.test.tsx; `scrollToBlock()` resolves `[data-paragraph-index="{blockId}"]` for articles — block-scroll.test.ts

#### ✅ PASS — The chapter's own reading experience is unchanged (hover `+`, inline editor, inline saved notes)
Evidence: `e2e/annotation.spec.ts` (14 tests, unchanged) and `e2e/scripture-browser.spec.ts` both still fully passing after `ChapterViewPage.tsx`'s grid restructuring — verified in the full suite run.

#### ✅ PASS — Only one `index.json` request when navigating Dashboard → chapter within `staleTime`
Evidence: `only one index.json request is made navigating Dashboard to a chapter` — note-history.spec.ts. Performs a real client-side SPA navigation (Dashboard → Browse Scripture → Book of Mormon → Alma → chapter 32, all via in-app `<Link>` clicks, no full page reloads) while counting every request matching `/index.json`; asserts exactly 1. This is the shared `useUserIndex()` hook (query key `["userIndex", userId]`) at work — [user-index.ts](../../../src/ui/lib/queries/user-index.ts).

### Layout & Tone

#### ✅ PASS — At ≥1024px the rail sits right of the reading column, sticks on scroll, body never scrolls horizontally
Evidence: manually verified live during implementation (screenshots taken, no committed artifact) — desktop grid renders correctly with `lg:grid-cols-[1fr_15rem]`; `document.documentElement.scrollWidth <= clientWidth` confirmed at 1200×900 with a real chapter page.

#### ✅ PASS — At 375px the rail is a collapsed disclosure above verse 1, expanding in place
Evidence: `mobile disclosure at 375px collapses by default and expands on click` — note-history.spec.ts; layout order confirmed via `lg:col-start-2 lg:row-start-1` (rail) / `lg:col-start-1 lg:row-start-1` (reading column) with the rail first in DOM — [ChapterViewPage.tsx](../../../src/ui/pages/ChapterViewPage.tsx), [ArticleViewPage.tsx](../../../src/ui/pages/ArticleViewPage.tsx)

#### ✅ PASS — Rail is sans-serif/muted; verse text stays serif; no accent competes with the scripture
Evidence: code review — `NoteHistoryRail.tsx`/`NoteHistoryModal.tsx` use only `text-xs`/`text-sm`, muted grays, hairline borders, no `shadow-*` or saturated accent-fill classes; `VerseList.tsx`/`ParagraphList.tsx` unchanged, still `fontFamily: "Georgia, serif"`.

#### ✅ PASS — Paging to a chapter with no past notes doesn't change the reading column's width
Evidence: `NoteHistoryRail.tsx` FR-15 — the `<aside>` always renders at ≥`lg` (reserving its grid column) whether empty, loading, error, or populated; confirmed via `shows the muted empty message for scripture and renders no mobile disclosure` (NoteHistoryRail.test.tsx) proving the aside branch still renders in the empty case.

#### ✅ PASS — With 12 entries, 8 render and "Show all 12 →" reveals the remaining 4
Evidence: `caps at 8 rows and reveals the rest via Show all` — NoteHistoryRail.test.tsx

#### ✅ PASS — Renders correctly in light and dark themes
Evidence: `renders correctly in dark theme` — note-history.spec.ts. Sets `theme=dark` via `localStorage`, confirms `<html class="dark">`, the rail renders and is visible, and directly checks `getComputedStyle(...).color === "rgb(209, 213, 219)"` (Tailwind gray-300) on the snippet text — proof the theme's dark-mode classes actually resolve correctly in a real browser, not just present in source.

### Filtering

#### ✅ PASS — Today's entry excluded; notes appear inline instead
Evidence: `selectNoteHistory()` excludes `date === today` — note-history.test.ts; `today's entry is excluded; entries for a different contentRef never appear` — note-history.spec.ts (today computed at runtime via `todayLocalDate()`, not a hardcoded string, matching the AC's explicit requirement)

#### ✅ PASS — Entries for a different `contentRef` never appear
Evidence: same test as above — an entry for `1-nephi/1.json` is asserted absent (`toHaveCount(0)`) while viewing `alma/32`.

#### ✅ PASS — Entries under a different `projectId` do appear
Evidence: `keeps entries under a different projectId` — note-history.test.ts; `an entry from a different project still appears in the rail` — note-history.spec.ts

#### ✅ PASS — >1 project shows names on rows/modal; exactly 1 project shows no badge anywhere
Evidence: `shows no project badge with a single project` / `shows the project name badge with more than one project` — NoteHistoryRail.test.tsx; `with more than one project, rows and the modal show the project name` — note-history.spec.ts (mocks `/api/projects` with 2 entries, asserts the badge on both the row and inside the opened modal)

### Loading & Error

#### ✅ PASS — Pulse skeleton while `index.json` is in flight; verse text already readable
Evidence: `shows a skeleton while loading` — NoteHistoryRail.test.tsx; `a pulse skeleton occupies the rail while index.json is in flight; chapter text is already readable` — note-history.spec.ts (holds the route open with an unresolved promise, asserts chapter verse text is visible and `aside .animate-pulse` is present simultaneously, then resolves and confirms the empty state replaces the skeleton)

#### ✅ PASS — 5xx shows "Couldn't load note history." and Retry succeeds on recovery
Evidence: `shows an error message with a working Retry` — NoteHistoryRail.test.tsx; `index failure shows the error message and Retry recovers` — note-history.spec.ts. This test specifically accounts for the app's global `retry: 1` QueryClient setting — a single failed fetch is auto-retried once before `isError` ever becomes true, so the mock fails calls 1–2 and only the user's manual Retry click (call 3) succeeds; this was caught and fixed during this check (the first draft of the test asserted on a state that a real browser's automatic retry made unobservable).

#### ✅ PASS — A rail row whose entry 404s opens a modal reading "Couldn't load this entry." with a working link
Evidence: `shows the error message with a working Open full entry link on failure` — NoteHistoryModal.test.tsx; `a row whose entry 404s shows the error message with a working Open full entry link` — note-history.spec.ts

#### ✅ PASS — A never-annotated user (`index.json` 404) sees the empty state, not an error
Evidence: `a user who has never annotated (index.json 404) sees the empty state, not an error` — note-history.spec.ts. Distinct from the already-empty-`200` empty-state test — this one returns a literal 404 and confirms it resolves to the same empty copy, never the error copy (`fetchUserIndex`'s explicit `res.status === 404 → {entries:[]}` branch — [user-index.ts](../../../src/ui/lib/queries/user-index.ts)).

### Accessibility

#### ✅ PASS — Modal has `role="dialog"`, `aria-modal="true"`, labelled by its date header
Evidence: `has dialog role, aria-modal, and is labelled by the date heading` — NoteHistoryModal.test.tsx (resolves `aria-labelledby` to an element containing "April 15, 2026")

#### ✅ PASS — Escape closes and returns focus to the rail row that opened it
Evidence: `closes on Escape` and `returns focus to the element that was focused before the modal opened` — NoteHistoryModal.test.tsx (added during this check — captures `document.activeElement` before mount, confirms it changes on open and is restored exactly on unmount).

#### ✅ PASS — Tab focus is trapped inside the modal, doesn't reach the verse list behind it
Evidence: `traps Tab focus within the dialog` — NoteHistoryModal.test.tsx (Tab from last element wraps to first; Shift+Tab from first wraps to last — the boundary-interception logic in [NoteHistoryModal.tsx](../../../src/ui/components/NoteHistoryModal.tsx) `preventDefault()`s exactly at the edges regardless of the modal's DOM position relative to the rest of the page).

#### ✅ PASS — Mobile disclosure exposes state via `aria-expanded`
Evidence: `toggles the mobile disclosure's aria-expanded and reveals rows` — NoteHistoryRail.test.tsx; `mobile disclosure at 375px collapses by default and expands on click` — note-history.spec.ts

#### ✅ PASS — Reduced-motion: instant scroll, static ring, no animation
Evidence: `uses instant scroll and the static class under prefers-reduced-motion` — block-scroll.test.ts (`behavior:"auto"`, `block-flash-static` class instead of the animated `block-flash`); CSS keyframes and the `@media (prefers-reduced-motion: reduce)` override — [index.css](../../../src/ui/index.css)

#### ✅ PASS — Every rail row and block label is reachable and operable by keyboard alone
Evidence: all interactive elements are semantic `<button type="button">` (rail rows, Show all, Retry, mobile disclosure, block labels) with no `tabindex` overrides or disabled states — confirmed by `getByRole("button", ...)` resolving every one of them across all component and e2e tests; native `<button>` Enter/Space activation is a browser-guaranteed behavior, not app logic that needs re-proving.

### Security & Privacy

#### ✅ PASS — Rail requests only `users/<userId>/…` for the authenticated session's `userId`; `entryId`s come from that user's own index
Evidence: `useUserIndex()`/`useJournalEntry()` both derive the URL from `useAuth().user.userId`, never from a route param or prop — [user-index.ts](../../../src/ui/lib/queries/user-index.ts), [entry.ts](../../../src/ui/lib/queries/entry.ts); `logging out and back in as a different user shows that user's own history, with no stale rows` — note-history.spec.ts (two distinct `userId`s, distinct mocked routes, confirms no cross-contamination after a fresh login).

#### ✅ PASS — No note text, snippet, or `entryId` in a URL query string, `document.title`, or any request beyond the two S3 GETs
Evidence: `grep -rn "document.title" src/ui` — no matches anywhere in the app. The only navigation using `entryId` is `Link to={`/entries/${entryId}`}` — a route **path** segment (the existing, already-reviewed `PastEntryPage` route), never a query string. No other outbound request is constructed from entry data anywhere in `NoteHistoryRail.tsx`/`NoteHistoryModal.tsx`.

#### ✅ PASS — Note text never written to console, including the schema-parse failure path
Evidence: `errors on a malformed payload and never logs annotation text` — [entry.test.tsx](../../../src/ui/lib/queries/__tests__/entry.test.tsx). `useJournalEntry`'s parse-failure path uses `safeParse` and logs only Zod issue **paths** (e.g. `annotations.0.text`), never field values.

#### ✅ PASS — Logout/login as a different user shows correct history, no stale rows
Evidence: `logging out and back in as a different user shows that user's own history, with no stale rows` — note-history.spec.ts. Query keys (`["userIndex", userId]`, `["entry", userId, entryId]`) are parameterized by `userId`, so a fresh login with a different `userId` addresses a different cache entry entirely — proven with a real fresh page load (`page.goto("/login")` between users, matching how a real logout/login cycle works) rather than just asserted architecturally.

---

## Non-Functional Requirements

- **Performance (rail doesn't delay first paint)**: ✅ PASS — architecturally independent queries (`useChapter`/`useUserIndex` are separate `useQuery` calls with no dependency between them); confirmed live — chapter verse text renders and is visible while the index request is still held open, in `a pulse skeleton occupies the rail while index.json is in flight; chapter text is already readable`.
- **Performance (≤300ms cached / ≤1s cold modal open)**: ⚠️ Not independently benchmarked — no load-testing harness exists in this repo for any feature's latency NFRs (consistent with prior acceptance reports in `docs/plans/completed/`, none of which include synthetic latency measurements). The mechanism (`useJournalEntry` sharing cache with `PastEntryPage`, single CloudFront GET) is unchanged from the existing, already-shipped annotation/dashboard latency profile.
- **Cost (zero Lambda, zero new AWS resources)**: ✅ PASS — `git diff --stat main -- infra/ src/handler/ src/repository/ src/service/` shows no changes in this feature. No new endpoints, no new Terraform resources.
- **Security (userId-scoped reads)**: ✅ PASS — see Security & Privacy criteria above; unchanged CloudFront/S3 key structure.
- **Accessibility (contrast ≥4.5:1 in both themes)**: ✅ PASS (after fix) — see Summary. Computed via WCAG relative-luminance formula against the actual Tailwind hex values in use; light theme 4.62:1, dark theme 7.94:1, both ≥4.5:1. The row/modal's primary snippet text was already well over threshold (7.2:1 light / 13.7:1 dark) and untouched.
- **Maintainability (shared components, no per-page duplicates)**: ✅ PASS — `NoteHistoryRail`/`NoteHistoryModal` are single components imported by both `ChapterViewPage.tsx` and `ArticleViewPage.tsx`; `useUserIndex()`/`useJournalEntry()` are single hooks shared with `DashboardPage.tsx`/`PastEntryPage.tsx` respectively.

---

## Out of Scope — confirmed untouched

- No changes to annotation editing/deletion, `UserIndex.snippet` semantics, `FR-44`, or the annotation spec's append-only model.
- `useAnnotationEditor`'s previously-noted `entryId`-derivation defect (today's notes lost on reload) was fixed separately in [PR #3](https://github.com/houseofdouglas/scripture-journal/pull/3), independent of this feature and its own commit.
