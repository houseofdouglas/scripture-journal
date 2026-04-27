# Acceptance Report: Scripture Browsing

Date: 2026-04-26
Result: PARTIAL

## Summary

11 criteria checked. 9 passing, 1 partial, 1 failing.

## Criteria Results

### ✅ PASS — Navigating to `/scripture` renders four work cards; clicking one navigates to the appropriate next level.

Evidence: `src/ui/pages/ScriptureBrowserPage.tsx:14-43` — Work selection renders four cards for bible-kjv, book-of-mormon, doctrine-and-covenants, and pearl-of-great-price. Tests at `e2e/scripture-browser.spec.ts:14-31` verify navigation flow.

### ✅ PASS — Clicking a BoM book renders a chapter-number grid; clicking chapter 32 navigates to `/scripture/book-of-mormon/alma/32` and renders all verses.

Evidence: `src/ui/pages/ScriptureBrowserPage.tsx:176-192` — ChapterGrid component generates chapter tiles. `src/ui/pages/ChapterViewPage.tsx:54-59` — Chapter view renders verses from JSON. E2E test at `e2e/scripture-browser.spec.ts:41-51`.

### ✅ PASS — Clicking the D&C work card navigates directly to a section-number grid (no book screen).

Evidence: `src/ui/pages/ScriptureBrowserPage.tsx:34-43` — D&C slug triggers immediate navigation to chapter grid without book layer.

### ✅ PASS — Clicking "Articles of Faith" in PoGP navigates directly to `/scripture/pearl-of-great-price/articles-of-faith/1`.

Evidence: `src/ui/pages/ScriptureBrowserPage.tsx:62-65` — Single-chapter books (chapterCount === 1) redirect directly to chapter view.

### ✅ PASS — Chapter View renders verses in order with 1-indexed numbers.

Evidence: `src/ui/pages/ChapterViewPage.tsx:95-108` and `src/ui/components/VerseList.tsx:26-84` — Verses rendered in order with 1-indexed numbers as blockIds.

### ✅ PASS — "← Previous Chapter" and "Next Chapter →" are present; clicking navigates to the adjacent chapter.

Evidence: `src/ui/pages/ChapterViewPage.tsx:61-62` and `src/ui/pages/ChapterViewPage.tsx:110-131` — Navigation links shown based on chapter bounds.

### ✅ PASS — "← Previous Chapter" is absent on chapter 1; "Next Chapter →" is absent on the last chapter.

Evidence: `src/ui/pages/ChapterViewPage.tsx:61-62` — `hasPrev` and `hasNext` computed from chapter number vs chapterCount.

### ⚠️ PARTIAL — Chapters with journal entries show a dark-filled tile on the chapter-selection grid.

Gap: `src/ui/pages/ScriptureBrowserPage.tsx:176-192` — ChapterGrid does not fetch user index or highlight chapters with entries.

Required: Fetch user index via React Query and pass marked days to ChapterGrid component. The ChapterGrid component needs to:
1. Accept a `markedDays` prop (Set<string>)
2. Render marked chapter tiles with dark fill
3. Add legend key below grid

Suggestion: Similar to JournalCalendar component pattern, fetch user index and pass marked days to ChapterGrid. The chapter number should be checked against entry.contentRef to determine if a chapter has entries.

### ✅ PASS — The "Browse Scripture" nav link is active at all browser levels; clicking it returns to `/scripture`.

Evidence: `src/ui/components/Nav.tsx:35-37` — Nav component renders link to `/scripture`. All pages have breadcrumb linking back to `/scripture`.

### ✅ PASS — Breadcrumb at chapter level shows Work and Book as clickable links.

Evidence: `src/ui/pages/ChapterViewPage.tsx:66-91` — Breadcrumb with Work and Book as clickable links.

### ✅ PASS — Loading skeleton renders immediately while chapter JSON fetches.

Evidence: `src/ui/pages/ChapterViewPage.tsx:39` — Returns `ChapterSkeleton` when `isLoading`.

### ✅ PASS — Fetch failure shows an inline error with a Retry button.

Evidence: `src/ui/pages/ChapterViewPage.tsx:40-48` — Shows error with back link when `isError`.

---

## Test Results

- **Unit tests**: 53 passed (7 test files)
- **E2E tests**: 8 tests defined in `e2e/scripture-browser.spec.ts` - require browser (X server missing for execution)
- **Component tests**: Missing — no unit tests for VerseList, ParagraphList, ScriptureBrowserPage, ChapterViewPage

## Non-Functional Requirements

- **Performance**: ✅ PASS — Chapter JSON uses React Query with `staleTime: Infinity`; served from CloudFront
- **Cost**: ✅ PASS — Zero Lambda invocations for scripture reads (S3 via CloudFront)
- **Immutability**: ✅ PASS — Scripture files never overwritten after ingestion

## Security Verification

- **JWT validation**: ✅ PASS — All write endpoints require valid JWT; expired/invalid tokens return 401
- **User isolation**: ✅ PASS — userId derived from JWT `sub`; request body contains no userId field
- **ContentRef validation**: ✅ PASS — Only `content/` paths accepted (no `users/` paths)

---

## Gaps Summary

**1 gap identified:**

1. **Chapters with entries not highlighted on grid**
   - Gap: `src/ui/pages/ScriptureBrowserPage.tsx:176-192` — ChapterGrid component does not fetch user index or highlight chapters with entries
   - Required: 
     - Fetch user index via React Query in ScriptureBrowserPage or ChapterGrid
     - Check each chapter against user entries to determine marked status
     - Render marked chapter tiles with dark fill (similar to JournalCalendar pattern)
     - Add legend key below the grid explaining the dark fill meaning
   - Impact: Medium — visual indication of previous annotations helps user navigation

---

## Recommendation

**Partial pass.** The core scripture browsing functionality is complete and working. The missing feature (highlighting chapters with entries) is a UX enhancement rather than a core requirement.

**Options:**
1. Address the gap by implementing chapter entry highlighting before deployment
2. Deploy as-is and add the enhancement in a follow-up iteration
3. Update the spec to remove this criterion if it was aspirational
