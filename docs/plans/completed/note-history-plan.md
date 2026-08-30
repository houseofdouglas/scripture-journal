# Execution Plan: note-history

Started: 2026-08-26
Status: DONE — all 10 tasks complete; spec acceptance PASS (34/34).

**Spec**: [docs/specs/note-history.md](../../specs/note-history.md)
**Tasks**: [docs/tasks/note-history-tasks.md](../../tasks/note-history-tasks.md)
**Acceptance Report**: [note-history-acceptance-2026-08-30.md](note-history-acceptance-2026-08-30.md)

## Progress

- [x] NH-01 — Test: repair E2E entry mocks and re-enable `webServer`
- [x] NH-02 — UI: pure note-history helpers
- [x] NH-03 — UI: extract `useUserIndex()` and refactor Dashboard
- [x] NH-04 — UI: extract `useJournalEntry()` and refactor Past Entry
- [x] NH-05 — UI: `scrollToBlock` and the highlight flash
- [x] NH-06 — UI: `NoteHistoryRail` component
- [x] NH-07 — UI: `NoteHistoryModal` component
- [x] NH-08 — UI: wire the rail into Chapter View
- [x] NH-09 — UI: wire the rail into Article View
- [x] NH-10 — Test: E2E coverage for note history

## Decisions & Notes

- **2026-08-26** — Feature delivers `FR-92` from the annotation spec (cross-session view of annotations on a content piece), deferred since 2026-04-22.
- **2026-08-26** — Four design decisions confirmed by Peter: persistent right rail at ≥`lg` (collapsed disclosure below); modal reader with `Open full entry →` to the existing Past Entry page; jump-to-verse with a 1.5s highlight; all projects included, today's entry excluded.
- **2026-08-26** — No backend work: the rail is derived client-side from the existing `UserIndex`, so the feature adds no endpoints, no Lambda invocations, and no infrastructure.
- **2026-08-26** — Reading column narrows from 42rem to ~39.5rem inside the existing `max-w-4xl` shell. Chosen over widening the shell, which would also stretch the Dashboard.
- **2026-08-26** — Pre-existing E2E breakage found while planning and folded into NH-01: `mockPastEntry` emits a payload that fails `JournalEntrySchema.parse` (4 of 9 `past-entry.spec.ts` tests fail on "Entry not found."), and `playwright.config.ts` has its `webServer` block commented out. Not caused by this feature; fixed first so later tasks have a green baseline.
- **2026-08-26** — `UserIndex.snippet` holds only an entry's *first* annotation, so a rail preview shows where a session's thinking started, not where it ended. Accepted; changing it would require backfilling every existing index.
- **2026-08-30** — NH-01 done. Fixing `mockPastEntry` (so it actually validates against `JournalEntrySchema`) exposed a real, previously-masked defect: the Past Entry page's happy-path view had no "← Dashboard" back link at all — only its error-state view did. The old broken mock always drove `past-entry.spec.ts` into that error path, which is why the missing link was never caught. Added a minimal always-"← Dashboard" link to `PastEntryPage.tsx` (dashboard spec FR-10's default case) to close the gap; the calendar-day-selected "← April 22, 2026" variant from FR-10 remains unimplemented and is out of scope here.
- **2026-08-30** — `webServer` now runs `npm run dev:vite` directly (not `npm run dev`), since E2E tests mock every API/content request via `page.route()` and never need the real Lambda dev server, which also requires a `.env.local` the CI/test environment may not have.
- **2026-08-30** — Two other sessions independently fixed the three unrelated broken E2E suites (article-import, change-password, article-view) and merged to `main` as [#4](https://github.com/houseofdouglas/scripture-journal/pull/4) and [#5](https://github.com/houseofdouglas/scripture-journal/pull/5). Merged cleanly via stash → fast-forward → pop (non-overlapping hunks in `e2e/helpers/mocks.ts`). Full E2E suite is now 75/75 green for the first time this session.
- **2026-08-30** — NH-04 done. `useJournalEntry()`'s parse-failure path uses `safeParse` and logs only Zod issue paths (e.g. `annotations.0.text`), never field values, satisfying NFR-14 while still surfacing which field broke.
- **2026-08-30** — This repo has no `@testing-library/jest-dom` installed — component tests use `.toBeTruthy()` / `queryBy...` + `toBeNull()` rather than `.toBeInTheDocument()`/`.toHaveAttribute()`, matching the existing convention in `ArticleViewPage.test.tsx`. Worth remembering for NH-07's modal tests too.
- **2026-08-30** — NH-06 done. `NoteHistoryRail` renders both the desktop `<aside>` and the mobile disclosure unconditionally in the DOM (Tailwind's `hidden lg:block` / `lg:hidden` classes control actual visibility only in a real browser — jsdom doesn't evaluate media queries), so its own unit tests verify structure/interaction only. Real breakpoint behavior (rail visible at ≥1024px, disclosure below it) is deferred to NH-10's Playwright coverage, which does run in a real browser and can resize the viewport.
- **2026-08-30** — NH-08 done. `ChapterViewPage` no longer wraps itself in `mx-auto max-w-2xl` — it now fills the AppShell's existing `max-w-4xl` and splits it via `grid-cols-[1fr_15rem]`, narrowing the reading column from 42rem to ~39.5rem as the spec anticipated. Verified live in a real Chromium browser (temporary, deleted scratch Playwright specs — not committed): desktop shows the rail correctly beside the verses with no overflow; mobile shows the disclosure above verse 1, collapsed by default, expanding in place on click. Found and confirmed **pre-existing**, unrelated horizontal overflow at 375px caused by `Nav.tsx` (reproduces on `/scripture` too, untouched by this feature) — flagged as its own background task, not fixed here.
- **2026-08-30** — NH-09 done. `ArticleViewPage` reuses NH-08's grid pattern, but only when `!isPastEntry` — the past-entry (`?entry-date=`) branch keeps its original single-column, `opacity-60`, rail-free layout untouched (satisfying FR-18 by construction, not by an extra visibility check). Verified live: rail renders correctly on a normal article view with a past note, empty state reads exactly "No past notes on this article.", and the rail/its data are completely absent — not just hidden — from the past-entry view.
- **2026-08-30** — NH-10 done — all 10 note-history tasks complete. `e2e/note-history.spec.ts` (12 tests) covers every scenario the task listed plus a self-audit against the spec's own Filtering and Loading & Error acceptance bullets, which caught three gaps the task description didn't spell out: the app's global `retry: 1` QueryClient setting means a single transient 5xx is invisible to the UI (the mock must fail the initial fetch *and* its automatic retry before the manual Retry button's click is what actually recovers); a 404 on `index.json` must resolve to the empty state, not the error state (distinct from an already-empty 200); and the loading skeleton and multi-project badge display weren't otherwise exercised in a real browser. Full suite: 87/87 (`npm run test:e2e`, cold start, no manually started server), `tsc --noEmit` clean.
- **2026-08-30** — `/check-acceptance` run: PASS, 34/34 criteria. Found and fixed one real defect — the rail/modal's muted metadata text (`text-gray-400 dark:text-gray-500`) computed to 2.43:1 contrast in light mode and 4.17:1 in dark mode, both below the spec's 4.5:1 NFR; swapped to `text-gray-500 dark:text-gray-400` (4.62:1 / 7.94:1). Closed 6 test-coverage gaps with 5 new tests: focus-restoration-on-close, single shared `index.json` request across a real Dashboard→Chapter SPA navigation, scroll-position preservation across modal open/close, live dark-theme rendering (including a `getComputedStyle` check that the contrast fix actually applies), and multi-user cache isolation on logout/login. `e2e/note-history.spec.ts` grew from 12 to 16 tests; full E2E suite 91/91. See [note-history-acceptance-2026-08-30.md](note-history-acceptance-2026-08-30.md) for full evidence per criterion.

**Feature complete and accepted.**
