# Spec: Scripture Browsing

**Status**: APPROVED
**Created**: 2026-04-22
**Last Updated**: 2026-04-22
**Related Specs**: auth, annotation

---

## Overview

**Summary**: Pre-loaded LDS Standard Works (KJV Bible, Book of Mormon, D&C, Pearl of Great Price) browsed at three levels (Work → Book → Chapter) and read as an ordered verse list, each verse an annotatable block.

**User Roles**: Reader

**Why**: Scripture is the primary content type. It must be fully self-contained (no external URL dependencies), browsable, and readable with block-level annotation affordance.

---

## User Stories

- As a **Reader**, I want to browse the four Standard Works by book and chapter, so that I can navigate to any scripture I want to study.
- As a **Reader**, I want to read a chapter as an ordered verse list, so that I can follow the text and add notes to specific verses.
- As a **Reader**, I want to navigate to the previous and next chapter with one click, so that I can read sequentially without returning to the browser.

---

## Functional Requirements

1. Scripture content is pre-loaded at deploy time and is immutable after initial load (BR-05).
2. All scripture files are served via CloudFront from S3. No Lambda is involved in reading scripture.
3. The SPA uses three React Router routes for scripture: Work selection (`/scripture`), Book selection (`/scripture/:work/:book`), and Chapter View (`/scripture/:work/:book/:chapter`).
4. D&C has no book level — clicking the D&C work card navigates directly to a section-number grid at `/scripture/doctrine-and-covenants` (no `:book` segment).
5. The Work selection screen presents four cards: `bible-kjv`, `book-of-mormon`, `doctrine-and-covenants`, `pearl-of-great-price`.
6. The Book selection screen lists books for the selected work. Bible books are grouped under `old-testament` and `new-testament` section headers.
7. Pearl of Great Price books with exactly one chapter (JS-Matthew, Articles of Faith) navigate directly to Chapter View on click — no intermediate chapter-number grid.
8. The Chapter View fetches `content/scripture/<work>/<book>/<chapter>.json` from CloudFront and renders an ordered list of verses.
9. Each verse is a distinct block identified by its `number` (1-indexed). `number` is the `blockId` for annotation.
10. Adjacent-chapter navigation ("← Previous Chapter" / "Next Chapter →") is shown at the bottom of the chapter. "← Previous Chapter" is hidden on chapter 1 of a book; "Next Chapter →" is hidden on the final chapter.
11. A loading skeleton is shown while the chapter JSON fetches.
12. On the chapter-selection grid (Level 3), tiles for chapters that have ≥ 1 journal entry in the user's `UserIndex` are rendered with a dark fill and a legend key below the grid.
13. The "Browse Scripture" nav link is highlighted as active on all three levels of the browser. Clicking it always navigates to `/scripture` (Work selection), regardless of current depth.
14. Breadcrumb links at each sub-level allow up-one-level navigation (Book → Work, Chapter → Book).

---

## Data Model

### `ScriptureChapter` — `content/scripture/<work>/<book>/<chapter>.json`

```typescript
interface ScriptureChapter {
  work: "bible-kjv" | "book-of-mormon" | "doctrine-and-covenants" | "pearl-of-great-price";
  book: string;       // kebab-case slug, e.g. "alma", "matthew", "genesis", "dc" (for D&C sections)
  chapter: number;    // 1-indexed (for D&C, this is the section number)
  title: string;      // e.g. "Alma 32", "Matthew 5", "D&C 76"
  verses: Array<{
    number: number;   // 1-indexed; used as blockId
    text: string;
  }>;
}
```

### `ScriptureManifest` — `content/scripture/manifest.json`

```typescript
interface ScriptureManifest {
  works: Array<{
    slug: string;
    title: string;
    books: Array<{
      slug: string;
      title: string;
      chapterCount: number;
      group?: "old-testament" | "new-testament"; // Bible only
    }>;
  }>;
}
```

Fetched once on first navigation to `/scripture`, cached by TanStack Query for the session.

### Content Reference Encoding

The `contentRef` stored in a `JournalEntry` for scripture is the full S3 key:

```
content/scripture/<work>/<book>/<chapter>.json
```

Examples:
- `content/scripture/book-of-mormon/alma/32.json`
- `content/scripture/doctrine-and-covenants/dc/76.json`
- `content/scripture/pearl-of-great-price/articles-of-faith/1.json`

---

## Error States & Edge Cases

| Scenario | Behaviour |
|----------|-----------|
| Chapter JSON fetch fails (network / 5xx) | Show inline error with retry button; skeleton remains |
| Invalid work/book/chapter in URL | 404-style empty state: "Chapter not found" with link to Scripture Browser |
| Manifest fetch fails | Work selection screen shows error with retry; no cards rendered |
| Single-chapter PoGP book selected | Navigate directly to Chapter View — skip chapter grid |
| D&C work selected | Navigate directly to section-number grid — skip book level |

---

## Acceptance Criteria

### Happy Path

- [ ] Navigating to `/scripture` renders four work cards; clicking one navigates to the appropriate next level.
- [ ] Clicking a BoM book renders a chapter-number grid; clicking chapter 32 navigates to `/scripture/book-of-mormon/alma/32` and renders all verses.
- [ ] Clicking the D&C work card navigates directly to a section-number grid (no book screen).
- [ ] Clicking "Articles of Faith" in PoGP navigates directly to `/scripture/pearl-of-great-price/articles-of-faith/1`.
- [ ] Chapter View renders verses in order with 1-indexed numbers.
- [ ] "← Previous Chapter" and "Next Chapter →" are present; clicking navigates to the adjacent chapter.
- [ ] "← Previous Chapter" is absent on chapter 1; "Next Chapter →" is absent on the last chapter.
- [ ] Chapters with journal entries show a dark-filled tile on the chapter-selection grid.
- [ ] The "Browse Scripture" nav link is active at all browser levels; clicking it returns to `/scripture`.
- [ ] Breadcrumb at chapter level shows Work and Book as clickable links.

### Loading & Error

- [ ] Loading skeleton renders immediately while chapter JSON fetches.
- [ ] Fetch failure shows an inline error with a Retry button.

### Performance

- [ ] Chapter JSON served from CloudFront within 500ms at p95 (NFR-01).

---

## Non-Functional Requirements

- **Performance**: p95 < 500ms chapter page render from CloudFront cache (NFR-01).
- **Cost**: Zero Lambda invocations for scripture reads — all S3 via CloudFront.
- **Immutability**: Scripture files are never overwritten after initial deploy (BR-05).

---

## Out of Scope

- Scripture full-text search (FR-93)
- Cross-book chapter navigation (e.g., end of Alma → start of Helaman)
- Footnote or cross-reference rendering
- Audio or video content

---

## Open Questions

| Question | Owner | Resolution |
|----------|-------|------------|
| Scripture source: scrape from churchofjesuschrist.org or use a public-domain dataset for ingestion script? | Peter | Resolved: churchofjesuschrist.org under personal/non-commercial ToU (see ADR 2026-04-21-content-scope) |
