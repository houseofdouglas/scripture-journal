# Spec: Note History

**Status**: APPROVED
**Created**: 2026-08-26
**Last Updated**: 2026-08-26
**Related Specs**: [annotation](annotation.md), [dashboard](dashboard.md), [scripture-browsing](scripture-browsing.md), [browse-articles](browse-articles.md)

---

## Overview

**Summary**: While reading a chapter or article, a muted right-hand rail lists the dates of past journal entries on that same content with a short preview of each; clicking one opens a modal with that day's full notes, from which the reader can jump to the annotated verse or open the full past entry.

**User Roles**: Reader

**Why**: Today the reader has no way to know they have studied a passage before. `FR-44` deliberately hides prior-session annotations from the inline reading flow to keep it uncluttered, and the only path to old notes is the Dashboard — which is organised by date, not by passage. This spec delivers `FR-92` ("cross-session view of all annotations on a content piece", deferred from the annotation spec) as a quiet, passage-anchored companion to the reading column: present enough to notice, muted enough to ignore.

**Cost note**: This feature adds **no new endpoints, no Lambda invocations, and no new infrastructure**. Everything it needs already exists in `users/<userId>/index.json` and `users/<userId>/entries/<entryId>.json`, both served from CloudFront.

---

## User Stories

- As a **Reader**, I want to see at a glance that I have studied this chapter before and on which dates, so that I can pick up a thread of thought instead of starting cold.
- As a **Reader**, I want a short preview of each past session's notes, so that I can tell which day is worth reopening without leaving the page.
- As a **Reader**, I want to read a past session's notes without losing my place in the chapter, so that a glance backwards costs me nothing.
- As a **Reader**, I want to jump from a past note to the verse it was written about, so that old reflection lands back on the text that prompted it.
- As a **Reader**, I want the history to stay visually quiet, so that the scripture text remains the focus of the page.

---

## Functional Requirements

### Data source

1. The note history is derived entirely client-side from `UserIndex` (`users/<userId>/index.json`), fetched from CloudFront. No new API endpoint is introduced and no Lambda is invoked.
2. `fetchUserIndex` is extracted from `DashboardPage` into a shared hook `useUserIndex()` (`src/ui/lib/queries/user-index.ts`) with query key `["userIndex", userId]` and `staleTime: 60_000`, so the Dashboard and the rail share one cache entry and one network request. `DashboardPage` is refactored to consume the hook; its behaviour is unchanged.
3. The rail selects `UserIndex.entries` where `entry.contentRef === <the current page's contentRef>`, sorted by `date` descending.
4. Entries whose `date` equals the client's local today (same `YYYY-MM-DD` string the annotation editor sends) are **excluded** — those notes are already rendered inline beneath their blocks by the live session.
5. Entries are **not** filtered by `projectId`. All past notes on this passage are shown regardless of project.

### The rail

6. On viewports ≥ `lg` (1024px), the content page renders a two-column grid: the reading column and a 15rem rail to its right. The breadcrumb and the `<h1>` span the full width above the grid.
7. The rail is `sticky` to the top of the viewport, scrolls internally when taller than the viewport, and never causes the page body to scroll horizontally.
8. Below `lg`, the rail collapses to a single muted disclosure button rendered above the verse/paragraph list — `🗒 5 past notes` — collapsed by default; pressing it expands the same list in place.
9. The rail is placed first in DOM order with explicit grid placement (`lg:col-start-2 lg:row-start-1` for the rail, `lg:col-start-1 lg:row-start-1` for the reading column) so the mobile disclosure appears above the text rather than below it.
10. Rail header: `Past notes` with the entry count.
11. Each row shows:
    - the entry date, formatted `MMM d` when the entry falls in the current calendar year and `MMM d, yyyy` otherwise (e.g. `Aug 12` / `Nov 3, 2025`);
    - the note count — `3 notes` / `1 note`;
    - a preview: `entry.snippet` truncated to **100 characters** on a word boundary, with a trailing `…` when truncated;
    - a project name badge, only when the user has more than one project (matching the Dashboard's `showProjectBadge` rule).
12. Visual treatment is deliberately quiet: sans-serif, `text-xs`/`text-sm`, muted greys, a hairline left border or divider per row, no accent fills, no shadows. It must read as marginalia, not as a call to action. Hover raises the row's contrast slightly to signal interactivity.
13. Rows are cap-limited to the **8** most recent entries; when more exist, a `Show all N →` toggle expands the full list in place (and collapses back).
14. Each row is a single button. Activating it opens the note history modal for that `entryId`.
15. Empty state (no past entries for this content): on ≥ `lg` the rail still renders, reserving its column, showing only the muted line `No past notes on this chapter.` (`…on this article.` for articles) — the reading column width therefore stays constant while paging between chapters. Below `lg`, nothing is rendered at all when the count is zero.
16. While `useUserIndex()` is loading, the rail shows a small pulse skeleton. The chapter/article content renders independently and is never blocked by the index request.
17. If the index request fails, the rail shows the muted line `Couldn't load note history.` with a `Retry` button that refetches. The content page remains fully readable and annotatable.
18. The rail is suppressed entirely on read-only historical views — `PastEntryPage`, and `ArticleViewPage` when `?entry-date=` is present.

### The modal

19. Opening a row fetches `users/<userId>/entries/<entryId>.json` from CloudFront, validated with `JournalEntrySchema`, via a shared hook `useJournalEntry(entryId)` (`src/ui/lib/queries/entry.ts`) using query key `["entry", userId, entryId]` — the same key `PastEntryPage` already uses, so the two share cache. `PastEntryPage` is refactored onto the hook; its behaviour is unchanged.
20. The modal renders:
    - a header with the full date label (`Wednesday, August 12, 2026`) and the note count;
    - the project name, when the user has more than one project;
    - every annotation in `entry.annotations`, in stored order, each as: a block label, the note's local time (`h:mm a`), and the **full** note text (never truncated) in sans-serif;
    - a footer link `Open full entry →` to `/entries/<entryId>`.
21. The block label is `Verse {blockId}` for `contentType: "scripture"` and `¶ {blockId + 1}` for `contentType: "article"` — matching `PastEntryPage`'s existing labels.
22. All dates rendered from a `YYYY-MM-DD` string MUST be constructed component-wise (`new Date(y, m - 1, d)`), never by passing the string to `new Date()`, which parses as UTC midnight and renders as the previous day in negative-offset timezones.
23. While the entry loads, the modal shows a skeleton. On failure it shows `Couldn't load this entry.` plus the `Open full entry →` link as an escape hatch.
24. Modal accessibility: `role="dialog"`, `aria-modal="true"`, labelled by its date header. On open, focus moves into the dialog; focus is trapped within it; `Escape` and a backdrop click both close it; on close, focus returns to the rail row that opened it. Background scroll is locked while open.
25. Only one modal is open at a time. The modal is independent of the annotation editor: opening it does not close an open editor, and the editor's unsaved text is untouched.

### Jump to block

26. The block label in the modal is a button. Activating it closes the modal and scrolls the corresponding block into view.
27. The scroll target is located by the attributes the block lists already render: `[data-verse="{blockId}"]` for scripture (`VerseList`) and `[data-paragraph-index="{blockId}"]` for articles (`ParagraphList`). No new anchor attributes are added.
28. The block is scrolled with `scrollIntoView({ behavior: "smooth", block: "center" })` and then flashes a highlight for 1.5s, after which it returns to its normal appearance with no residual style.
29. Under `prefers-reduced-motion: reduce`, the scroll uses `behavior: "auto"` and the highlight is a static ring shown for 1.5s with no animation.
30. If the target block is not present in the DOM, the click is a no-op: the modal stays open and no error is shown.

---

## Data Model

**No new persisted types. No writes. No schema changes.**

The feature reads two existing shapes, both defined in `src/types/annotation.ts`:

### `UserIndexEntry` — fields consumed by the rail

| Field | Type | Used for |
|-------|------|----------|
| `entryId` | `string` | Modal fetch key and `/entries/<entryId>` link |
| `date` | `string` (`YYYY-MM-DD`) | Row date label; today-exclusion filter |
| `contentRef` | `string` | Match against the current page's contentRef |
| `contentType` | `"scripture" \| "article"` | Block label form; scroll selector |
| `projectId` | `string` | Project badge (default `"personal"`) |
| `snippet` | `string` (≤200) | Row preview, truncated to 100 chars for display |
| `noteCount` | `number` | Row note count |

### `JournalEntry` — fields consumed by the modal

`date`, `contentType`, `projectId`, and `annotations[]` (`{ blockId, text, createdAt }`).

### Known limitation of `snippet`

`UserIndex.entries[].snippet` is written from the **first** annotation of an entry only (annotation spec, Data Model). A row preview therefore shows the opening note of that session, not its most recent one. This is accepted: the preview exists to identify a session, and the modal shows everything. Changing snippet semantics would require a backfill of every existing index and is out of scope.

---

## API Contract

**None.** This feature introduces no endpoints and modifies none.

Reads (both CloudFront-cached S3 GETs, already in use elsewhere in the app):

| Request | Purpose | Missing-object behaviour |
|---------|---------|--------------------------|
| `GET /users/<userId>/index.json` | Rail rows | 404 → treated as `{ entries: [] }` (existing behaviour) |
| `GET /users/<userId>/entries/<entryId>.json` | Modal contents | 404 → modal error state |

`userId` comes from the authenticated session (`useAuth()`), derived from the JWT `sub` — never from a URL or user input.

---

## Error States & Edge Cases

| Scenario | Behaviour |
|----------|-----------|
| No past entries for this content | ≥`lg`: rail column reserved, muted `No past notes on this chapter.` `<lg`: nothing rendered |
| `index.json` returns 404 (user has never annotated) | Treated as empty — empty state, no error |
| `index.json` request fails (5xx / offline) | Muted `Couldn't load note history.` + `Retry`; chapter still readable and annotatable |
| Entry JSON 404 (index references a deleted entry) | Modal shows `Couldn't load this entry.` with `Open full entry →`; the rail row remains |
| Entry JSON fails `JournalEntrySchema` parse | Same as 404 — modal error state; parse failure logged to console only, never the note text |
| Only entry for this content is today's | Filtered out by FR-4 → empty state. The reader still sees today's notes inline |
| Note saved moments ago | Not expected in the rail: today is excluded, so the 60s `staleTime` on the shared index is never user-visible here |
| >8 past entries on one passage | 8 shown, `Show all N →` reveals the rest |
| User has >1 project, entries span projects | All shown; each row and the modal carry a project name badge |
| Entry's `projectId` refers to a deleted project | Badge falls back to the raw `projectId` string; no error |
| `blockId` in a note has no matching block on the page | Label click is a no-op; modal stays open. (Practically unreachable: scripture chapters are immutable and article `contentRef`s are content-addressed per version) |
| Reader is on `PastEntryPage` or `ArticleViewPage?entry-date=` | Rail suppressed entirely (FR-18) |
| Reader navigates prev/next chapter with the modal open | Modal closes on route change; the rail refilters to the new `contentRef` |
| Annotation editor is open when a row is clicked | Modal opens over it; editor stays open with its unsaved text intact |
| Viewport resized across the `lg` boundary while expanded | Disclosure state and `Show all` state persist; layout switches without losing the open modal |
| Extremely long single-word snippet (no spaces in 100 chars) | Hard-truncated at 100 chars with `…`; row does not overflow its column |

---

## Acceptance Criteria

### Happy Path

- [ ] On a chapter with 3 past entries, the rail renders `Past notes` and 3 rows, newest date first.
- [ ] Each row shows its date, note count (`1 note` / `3 notes`), and a preview of at most 100 characters ending in `…` when the snippet is longer.
- [ ] An entry from a previous calendar year shows the year (`Nov 3, 2025`); an entry from the current year does not (`Aug 12`).
- [ ] Clicking a row opens a modal listing every annotation from that entry with its block label, local time, and full untruncated text.
- [ ] The modal's `Open full entry →` link navigates to `/entries/<entryId>`.
- [ ] Closing the modal leaves the reader's scroll position in the chapter unchanged.
- [ ] Clicking a note's `Verse 12` label closes the modal, scrolls verse 12 into view, and flashes a highlight that clears within 2s leaving no residual style.
- [ ] On an article, block labels read `¶ 4` and the scroll targets `[data-paragraph-index="3"]`.
- [ ] The chapter's own reading experience is unchanged: `+` on hover, inline editor, inline saved notes for today all behave exactly as before.
- [ ] Only one network request for `index.json` is made when navigating Dashboard → chapter within the `staleTime` window (shared cache).

### Layout & Tone

- [ ] At ≥1024px the rail sits to the right of the reading column, sticks to the top on scroll, and the page body never scrolls horizontally.
- [ ] At 375px the rail is replaced by a collapsed `🗒 3 past notes` disclosure above verse 1, which expands the list in place.
- [ ] Rail typography is sans-serif and muted; verse text remains serif. No accent fill, shadow, or badge in the rail competes with the scripture text for attention.
- [ ] Paging from a chapter with past notes to one without does not change the reading column's width (rail column stays reserved at ≥`lg`).
- [ ] With 12 past entries, 8 rows render and `Show all 12 →` reveals the remaining 4.
- [ ] The rail renders correctly in both light and dark themes.

### Filtering

- [ ] An entry dated today for this content does **not** appear in the rail; its notes appear inline below their blocks instead.
- [ ] Entries for a *different* `contentRef` (another chapter, another article) never appear.
- [ ] Entries created under a different `projectId` **do** appear.
- [ ] With more than one project, each row and the modal show the project name; with exactly one project, no badge is rendered anywhere.

### Loading & Error

- [ ] A pulse skeleton occupies the rail while `index.json` is in flight; verse text is already readable at that moment.
- [ ] `index.json` failing with a 5xx shows `Couldn't load note history.` and a `Retry` that succeeds on recovery.
- [ ] A rail row whose entry JSON 404s opens a modal reading `Couldn't load this entry.` with a working `Open full entry →` link.
- [ ] A user who has never annotated anything (`index.json` 404) sees the empty-state line, not an error.

### Accessibility

- [ ] The modal has `role="dialog"`, `aria-modal="true"`, and is labelled by its date header.
- [ ] `Escape` closes the modal and returns focus to the rail row that opened it.
- [ ] Tab focus is trapped inside the open modal and does not reach the verse list behind it.
- [ ] The mobile disclosure exposes its expanded/collapsed state via `aria-expanded`.
- [ ] Under `prefers-reduced-motion: reduce`, the jump-to-verse scroll is instant and the highlight is a static ring, not an animation.
- [ ] Every rail row and block label is reachable and operable by keyboard alone.

### Security & Privacy

- [ ] The rail requests only `users/<userId>/…` for the `userId` in the authenticated session; `entryId` values come from that user's own index.
- [ ] No note text, snippet, or `entryId` is ever placed in a URL query string, `document.title`, or any outbound request beyond the two S3 GETs above.
- [ ] Note text is never written to `console` — including in the schema-parse failure path.
- [ ] Logging out and back in as a different user shows that user's history, with no stale rows from the previous session (query keys are `userId`-scoped).

---

## Non-Functional Requirements

- **Performance**: The rail must not delay first meaningful paint of the chapter — the index query is independent of the content query and its pending state renders as a skeleton. Rail rows render within the Dashboard's existing 500ms p95 CloudFront budget (NFR-01), since they come from the same cached object.
- **Performance**: Modal open-to-content ≤ 300ms at p95 when the entry is CloudFront-cached; ≤ 1s cold.
- **Cost**: Zero Lambda invocations and zero new AWS resources. No increase in S3 request volume beyond one entry GET per modal open (deduped by the shared query cache).
- **Security**: All reads are `userId`-scoped S3 keys; CloudFront returns 404 for another user's key (existing behaviour, unchanged).
- **Accessibility**: Meets the modal and reduced-motion criteria above; contrast for muted rail text is ≥ 4.5:1 against its background in both themes.
- **Maintainability**: Rail and modal are shared components used by both `ChapterViewPage` and `ArticleViewPage` — no page-specific duplicates.

---

## Implementation Notes

New files (UI components use PascalCase, matching the existing `src/ui/components/` convention rather than the constitution's general kebab-case file rule):

| File | Purpose |
|------|---------|
| `src/ui/lib/queries/user-index.ts` | `useUserIndex()` — extracted from `DashboardPage` |
| `src/ui/lib/queries/entry.ts` | `useJournalEntry(entryId)` — extracted from `PastEntryPage` |
| `src/ui/components/NoteHistoryRail.tsx` | Rail + mobile disclosure + `Show all` |
| `src/ui/components/NoteHistoryModal.tsx` | Dialog, focus management, block-label buttons |
| `src/ui/lib/block-scroll.ts` | `scrollToBlock(contentType, blockId)` + highlight/reduced-motion handling |
| `src/ui/lib/note-history.ts` | Pure helpers: filter by contentRef, exclude today, sort, format date label, truncate snippet |

Modified: `ChapterViewPage.tsx` and `ArticleViewPage.tsx` (grid + rail), `DashboardPage.tsx` and `PastEntryPage.tsx` (consume the shared hooks), `src/ui/index.css` (block-flash keyframes + reduced-motion variant).

Tests: unit tests for `note-history.ts` helpers (timezone-safe date labels, today-exclusion, truncation) and `block-scroll.ts`; component tests for `NoteHistoryRail` and `NoteHistoryModal`; `e2e/note-history.spec.ts` covering the happy path, jump-to-verse, empty state, and the mobile disclosure.

---

## Out of Scope

- Editing or deleting past annotations (annotation spec `FR-90` — append-only by design).
- Changing `UserIndex.snippet` semantics or backfilling existing indexes so previews reflect the latest note rather than the first.
- Showing today's in-progress entry in the rail (excluded by FR-4; inline rendering already covers it).
- Any change to `FR-44` — prior-session annotations remain absent from the inline reading flow.
- Note history for *adjacent* content (other chapters in the same book, other versions of the same article).
- Search or full-text filtering across note history.
- Cross-content "related notes" or tagging.
- Server-side aggregation of a per-content note index — unnecessary while the client-side `UserIndex` filter suffices.
- Sharing note history between users (annotation spec `FR-91`).

### Related pre-existing defect (not fixed here)

`useAnnotationEditor`'s `fetchEntry` derives `entryId` from the last path segment of `contentRef` rather than `${date}_${sha256(contentRef).slice(0,16)}`, and reads a `savedAnnotations` field that `JournalEntry` does not have — so today's notes are lost on page reload. This spec does not depend on that path (the rail gets `entryId` values straight from the index) and does not fix it. Worth a separate task.

---

## Open Questions

| Question | Owner | Resolution |
|----------|-------|------------|
| Rail vs. slide-over vs. inline block | Peter | **Resolved 2026-08-26**: persistent right rail at ≥`lg`, collapsed disclosure below it |
| Modal, link, or both | Peter | **Resolved 2026-08-26**: modal, with `Open full entry →` to the existing Past Entry page |
| Should a note link back to its verse | Peter | **Resolved 2026-08-26**: yes — scroll + 1.5s highlight, using the existing `data-verse` / `data-paragraph-index` attributes |
| Project scoping and today's entry | Peter | **Resolved 2026-08-26**: all projects, today excluded |
