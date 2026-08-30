# Tasks: Note History

**Spec**: [docs/specs/note-history.md](../specs/note-history.md)
**Created**: 2026-08-26
**Status**: PENDING

---

## Task: NH-01 — Test: repair E2E entry mocks and re-enable `webServer`

**Layer**: Test
**Estimate**: 1hr
**Depends on**: none
**Status**: DONE
**Completed**: 2026-08-30

### What to build
Fix `mockPastEntry` in `e2e/helpers/mocks.ts` to emit a payload that satisfies `JournalEntrySchema`: `entryId`, `userId` (a UUID matching `seedAuth`'s JWT `sub`), `date`, `contentRef`, `contentTitle`, `contentType`, `projectId`, `annotations[]` (`{ blockId, text, createdAt }`), `updatedAt`. Keep the existing call signature working — map the current `notes` argument onto `annotations` — so the four broken `past-entry.spec.ts` tests pass unmodified. Add `projectId?: string` to `EntryStub` (defaulting to `"personal"`) so `mockUserIndex` can stub multi-project rows. Uncomment the `webServer` block in `playwright.config.ts` so the suite starts its own Vite server.

**Context**: this is a pre-existing failure, not caused by the note-history feature. `mockPastEntry` currently emits `{ id, contentRef, title, date, notes }`, which fails `JournalEntrySchema.parse`, so `PastEntryPage` renders "Entry not found." — verified 2026-08-26 as 4 of 9 failures in `e2e/past-entry.spec.ts`. With `webServer` commented out, all 18 fail with `ERR_CONNECTION_REFUSED` unless a dev server is started by hand.

### Acceptance criteria
- [ ] `npx playwright test e2e/past-entry.spec.ts --project=chromium` is 9/9 green with no changes to the spec file
- [ ] The suite runs from a cold shell with no manually started dev server
- [ ] `mockUserIndex` accepts and emits `projectId`, defaulting to `"personal"`
- [ ] No other e2e spec regresses

### Files expected
- `e2e/helpers/mocks.ts` — correct `mockPastEntry` payload; `projectId` on `EntryStub`
- `playwright.config.ts` — re-enable `webServer`

---

## Task: NH-02 — UI: pure note-history helpers

**Layer**: UI
**Estimate**: 1hr
**Depends on**: none
**Status**: DONE
**Completed**: 2026-08-30

### What to build
Create `src/ui/lib/note-history.ts` with side-effect-free helpers, each independently unit-testable:

- `selectNoteHistory(entries, contentRef, today)` — filter by `contentRef`, drop `date === today`, sort `date` descending
- `formatEntryDateLabel(date, today)` — `MMM d` in the current calendar year, `MMM d, yyyy` otherwise
- `formatFullDateLabel(date)` — `Wednesday, August 12, 2026`
- `truncateSnippet(text, max = 100)` — word-boundary cut with trailing `…`, hard-cut when a single token exceeds `max`
- `formatNoteCount(n)` — `1 note` / `3 notes`
- `blockLabel(contentType, blockId)` — `Verse 12` / `¶ 4`

Every `YYYY-MM-DD` → `Date` conversion must be component-wise (`new Date(y, m - 1, d)`) per spec FR-22 — never `new Date(string)`, which parses as UTC midnight and renders as the previous day in negative-offset timezones.

### Acceptance criteria
- [ ] `selectNoteHistory` excludes today, excludes other `contentRef`s, keeps other `projectId`s, returns newest-first
- [ ] `formatEntryDateLabel("2026-08-12", "2026-08-26")` → `Aug 12`; `("2025-11-03", "2026-08-26")` → `Nov 3, 2025`
- [ ] Date labels are correct with the test process pinned to `TZ=America/Denver` — `2026-08-12` never renders as Aug 11
- [ ] `truncateSnippet` cuts on a word boundary, appends `…` only when truncating, and hard-cuts a 150-char single token at 100
- [ ] `blockLabel("article", 3)` → `¶ 4`; `blockLabel("scripture", 12)` → `Verse 12`
- [ ] `tsc --noEmit` and `eslint` clean

### Files expected
- `src/ui/lib/note-history.ts`
- `src/ui/lib/__tests__/note-history.test.ts`

---

## Task: NH-03 — UI: extract `useUserIndex()` and refactor Dashboard

**Layer**: UI
**Estimate**: 30min
**Depends on**: none
**Status**: DONE
**Completed**: 2026-08-30

### What to build
Move `fetchUserIndex` out of `DashboardPage.tsx` into `src/ui/lib/queries/user-index.ts` as a `useUserIndex()` hook — query key `["userIndex", userId]`, `staleTime: 60_000`, `enabled: Boolean(user)`, 404 → `{ entries: [] }`. Refactor `DashboardPage` to consume it. Behaviour-preserving; the shared cache is the point (spec AC: one `index.json` request across Dashboard → chapter).

### Acceptance criteria
- [ ] `DashboardPage` no longer declares its own fetch or `useQuery` for the index
- [ ] Query key and `staleTime` are unchanged from the current inline version
- [ ] `e2e/dashboard.spec.ts` passes unchanged
- [ ] `tsc --noEmit` and `eslint` clean

### Files expected
- `src/ui/lib/queries/user-index.ts` — new hook
- `src/ui/pages/DashboardPage.tsx` — consume it

---

## Task: NH-04 — UI: extract `useJournalEntry()` and refactor Past Entry

**Layer**: UI
**Estimate**: 30min
**Depends on**: NH-01
**Status**: DONE
**Completed**: 2026-08-30

### What to build
Move `fetchEntry` out of `PastEntryPage.tsx` into `src/ui/lib/queries/entry.ts` as `useJournalEntry(entryId)` — query key `["entry", userId, entryId]`, `JournalEntrySchema.parse` on the response, 404 → `null`. Refactor `PastEntryPage` to consume it. Parse failures must be logged without the note text (NFR-14). Depends on NH-01 so the suite is green enough to prove the refactor changed nothing.

### Acceptance criteria
- [ ] `PastEntryPage` no longer declares its own entry fetch
- [ ] `e2e/past-entry.spec.ts` still 9/9 green after the refactor
- [ ] A malformed entry payload yields the error state; the console output contains no annotation text
- [ ] `tsc --noEmit` and `eslint` clean

### Files expected
- `src/ui/lib/queries/entry.ts` — new hook
- `src/ui/pages/PastEntryPage.tsx` — consume it

---

## Task: NH-05 — UI: `scrollToBlock` and the highlight flash

**Layer**: UI
**Estimate**: 1hr
**Depends on**: none
**Status**: DONE
**Completed**: 2026-08-30

### What to build
Create `src/ui/lib/block-scroll.ts` exporting `scrollToBlock(contentType, blockId): boolean`. It resolves `[data-verse="{blockId}"]` for scripture and `[data-paragraph-index="{blockId}"]` for articles — the attributes `VerseList` and `ParagraphList` already render, so no new anchors. Returns `false` and does nothing when the element is absent (FR-30). Calls `scrollIntoView({ behavior: "smooth", block: "center" })`, adds a `block-flash` class, and removes it after 1.5s via a timer that is safe to call re-entrantly (a second call on the same block restarts the flash rather than stacking timers). Under `prefers-reduced-motion: reduce` (checked with `matchMedia`), uses `behavior: "auto"` and a `block-flash-static` class. Add both classes plus keyframes to `src/ui/index.css` in an `@layer utilities` block, with the reduced-motion variant guarded by `@media (prefers-reduced-motion: reduce)`.

### Acceptance criteria
- [ ] Returns `true` and calls `scrollIntoView` with `behavior: "smooth"` for a present verse block
- [ ] Returns `false` and does not throw for an absent `blockId`
- [ ] The flash class is removed 1.5s later, leaving `className` exactly as it began
- [ ] Two calls in quick succession on one block leave a single pending timer and one clean removal
- [ ] With `matchMedia("(prefers-reduced-motion: reduce)")` stubbed to match, `behavior` is `"auto"` and the static class is used
- [ ] `tsc --noEmit` and `eslint` clean

### Files expected
- `src/ui/lib/block-scroll.ts`
- `src/ui/lib/__tests__/block-scroll.test.ts`
- `src/ui/index.css` — flash utilities and keyframes

---

## Task: NH-06 — UI: `NoteHistoryRail` component

**Layer**: UI
**Estimate**: 2hr
**Depends on**: NH-02, NH-03
**Status**: DONE
**Completed**: 2026-08-30

### What to build
Create `src/ui/components/NoteHistoryRail.tsx`, taking `{ contentRef, contentType, onOpenEntry }`. It calls `useUserIndex()` and `selectNoteHistory`, renders the `Past notes` header with a count, and one button row per entry: date label, note count, 100-char preview, and a project badge only when `useProjects()` returns more than one (matching the Dashboard's `showProjectBadge` rule). Caps at 8 rows with a `Show all N →` toggle. Owns its own responsive behaviour internally — the full list at `lg`+, a collapsed `aria-expanded` disclosure below it (FR-8) — while the page owns grid placement. Handles all four states: loaded, skeleton, error (`Couldn't load note history.` + `Retry` calling `refetch`), and empty (muted line at `lg`+, nothing rendered below `lg`). Styling is deliberately muted per FR-12: sans-serif, `text-xs`/`text-sm`, muted greys, hairline dividers, no accent fills or shadows, both themes.

### Acceptance criteria
- [ ] Renders the header and one row per past entry, newest first, with date, note count, and truncated preview
- [ ] With 12 entries, 8 render and `Show all 12 →` reveals the remaining 4
- [ ] With one project no badge renders anywhere; with two, rows carry the project name
- [ ] Loading shows a skeleton; error shows the muted message and a `Retry` that refetches; empty shows the muted line at `lg`+ and nothing below `lg`
- [ ] A row click calls `onOpenEntry` with that `entryId`
- [ ] The mobile disclosure toggles `aria-expanded` correctly
- [ ] Every row is reachable and operable by keyboard alone
- [ ] `tsc --noEmit` and `eslint` clean

### Files expected
- `src/ui/components/NoteHistoryRail.tsx`
- `src/ui/components/__tests__/NoteHistoryRail.test.tsx`

---

## Task: NH-07 — UI: `NoteHistoryModal` component

**Layer**: UI
**Estimate**: 2hr
**Depends on**: NH-02, NH-04, NH-05
**Status**: DONE
**Completed**: 2026-08-30

### What to build
Create `src/ui/components/NoteHistoryModal.tsx`, taking `{ entryId, contentType, onClose }`. It calls `useJournalEntry(entryId)` and renders the full date header, note count, project name when the user has more than one project, and every annotation in stored order as a block-label button, local time (`h:mm a`), and full untruncated text in sans-serif. Footer: `Open full entry →` to `/entries/<entryId>`. The block-label button calls `onClose` then `scrollToBlock` (FR-26). Accessibility per FR-24: `role="dialog"`, `aria-modal="true"`, labelled by the date header, focus moved in on open and trapped, `Escape` and backdrop click close, focus restored to the opener by the parent, background scroll locked while open. Loading shows a skeleton; failure shows `Couldn't load this entry.` plus the `Open full entry →` escape hatch.

### Acceptance criteria
- [ ] Renders every annotation with block label, local time, and full untruncated text
- [ ] Scripture labels read `Verse 12`; article labels read `¶ 4`
- [ ] Clicking a block label closes the modal and invokes `scrollToBlock` with the right `contentType` and `blockId`
- [ ] `Escape` and a backdrop click both close; tab focus never reaches content behind the dialog
- [ ] `role="dialog"`, `aria-modal="true"`, and the `aria-labelledby` date header are present
- [ ] Background scroll is locked while open and restored on close
- [ ] A 404 entry shows the error message with a working `Open full entry →` link
- [ ] `tsc --noEmit` and `eslint` clean

### Files expected
- `src/ui/components/NoteHistoryModal.tsx`
- `src/ui/components/__tests__/NoteHistoryModal.test.tsx`

---

## Task: NH-08 — UI: wire the rail into Chapter View

**Layer**: UI
**Estimate**: 2hr
**Depends on**: NH-06, NH-07
**Status**: DONE
**Completed**: 2026-08-30

### What to build
Restructure `ChapterViewPage.tsx` into the two-column layout of FR-6/FR-7/FR-9: breadcrumb and `<h1>` full-width above a grid whose reading column is `lg:col-start-1 lg:row-start-1` and whose rail is `lg:col-start-2 lg:row-start-1` — rail **first in DOM** so the mobile disclosure lands above verse 1. Rail column is 15rem, sticky to viewport top, internally scrollable, and always reserved at `lg`+ so the reading column width does not change between chapters. Below `lg`, one column. Hold the open `entryId` in page state, render the modal when set, restore focus to the originating row on close, and close the modal on route change. Verify no horizontal body scroll at 375px and 1024px.

### Acceptance criteria
- [ ] At ≥1024px the rail sits right of the verses and sticks on scroll; the body never scrolls horizontally
- [ ] At 375px the rail is a collapsed disclosure above verse 1, not below the verse list
- [ ] Paging to a chapter with no past notes does not change the reading column width
- [ ] Clicking a row opens the modal; closing it leaves scroll position unchanged and returns focus to that row
- [ ] Navigating prev/next chapter closes the modal and refilters the rail to the new `contentRef`
- [ ] Hover `+`, the inline editor, and today's inline notes behave exactly as before
- [ ] Opening the modal with the annotation editor open leaves the editor and its unsaved text intact
- [ ] `e2e/annotation.spec.ts` and `e2e/scripture-browser.spec.ts` pass unchanged
- [ ] `tsc --noEmit` and `eslint` clean

### Files expected
- `src/ui/pages/ChapterViewPage.tsx`

---

## Task: NH-09 — UI: wire the rail into Article View

**Layer**: UI
**Estimate**: 1hr
**Depends on**: NH-08
**Status**: DONE
**Completed**: 2026-08-30

### What to build
Apply the same grid and modal wiring to `ArticleViewPage.tsx` with `contentRef = content/articles/<articleId>.json` and `contentType: "article"`, reusing the structure NH-08 establishes. Suppress the rail entirely when `?entry-date=` is present (FR-18), since that is a read-only historical view. Confirm the empty-state copy reads `No past notes on this article.`

### Acceptance criteria
- [ ] The rail renders on a normal article view with article-shaped block labels and `¶` scroll targets
- [ ] The rail is absent when `?entry-date=` is present
- [ ] Empty state reads `No past notes on this article.`
- [ ] The archive/unarchive controls and existing article header behaviour are unaffected
- [ ] `e2e/article-view.spec.ts` and `e2e/archive-articles.spec.ts` pass unchanged
- [ ] `tsc --noEmit` and `eslint` clean

### Files expected
- `src/ui/pages/ArticleViewPage.tsx`

---

## Task: NH-10 — Test: E2E coverage for note history

**Layer**: Test
**Estimate**: 2hr
**Depends on**: NH-08, NH-09
**Status**: DONE
**Completed**: 2026-08-30

### What to build
Add `e2e/note-history.spec.ts` using `seedAuth`, `mockUserIndex`, `mockScriptureChapter`, and the NH-01-corrected `mockPastEntry`. Cover: the rail listing past entries newest-first with previews; today's entry excluded while entries for other `contentRef`s never appear; an entry from another `projectId` still appearing; the modal showing full note text and its `Open full entry →` link; jump-to-verse scrolling the verse into view; the empty state; the index-failure message and `Retry`; a row whose entry 404s; and the mobile disclosure at a 375px viewport.

### Acceptance criteria
- [ ] Every scenario above is asserted and the spec is green in the `chromium` project
- [ ] Today-exclusion is asserted against a date computed at runtime, not a hardcoded string
- [ ] The full suite (`npm run test:e2e`) is green with no manually started dev server
- [ ] At least one assertion covers each Filtering and Loading & Error criterion in the spec

### Files expected
- `e2e/note-history.spec.ts`
- `e2e/helpers/mocks.ts` — extend only if a scenario needs a stub NH-01 didn't add

---

## Order rationale

NH-01 first because it turns an already-red suite green and supplies correct fixtures for everything after it. NH-02, NH-03, and NH-05 are dependency-free and can run in parallel. The two components (NH-06, NH-07) build on the helpers and hooks; page wiring (NH-08, NH-09) comes after both, Chapter before Article so Article reuses the established structure; E2E last.

**Total estimate**: 13 hours across 10 tasks.
