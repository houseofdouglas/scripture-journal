# Spec: Rich Article Blocks (Headings, Lists, Code, Tables & Figures)

**Status**: IMPLEMENTED
**Created**: 2026-09-30
**Last Updated**: 2026-10-01
**Related Specs**: [article-import](article-import.md), [annotation](annotation.md), [note-history](note-history.md), [browse-articles](browse-articles.md), [pdf-textract-extraction](pdf-textract-extraction.md)

**Prerequisite**: ADR `docs/adr/2026-10-01-rich-article-blocks.md`, which (a) relaxes the AGENTS.md rule "source content is plain text only" to permit structured headings, lists, code, tables, and stored images, and (b) adds `content/assets/` to the constitution's storage layout. The constitution is amended via that ADR, not edited in place during feature work.

---

## Overview

**Summary**: URL imports preserve all visible article content — headings (`h1`–`h6`), lists, code blocks, tables, figures (raster and sanitized SVG), and any remaining loose text — as ordered, individually annotatable blocks; images are stored locally and displayed at their original aspect ratio with a "View original size" option when scaled down.

**User Roles**: Reader

**Why**: The importer currently extracts only `<p>` elements. On the reference article — *The AI-Native SDLC Playbook* (`https://claude.com/blog/the-ai-native-sdlc-playbook`) — that loses 10 `h2`, 21 `h3`, 38 `h4` (repeated labels such as "How to execute it" and "Governance considerations" that frame each play), 19 lists, 13 code blocks, one 3-column × 6-row comparison table, four diagram images, and callout boxes (`.sd-key`, `.sd-side`, …) whose text sits in bare `<div>`s. The result reads as disconnected paragraphs with the argument's structure, examples, and diagrams missing. Headings also give the Reader a section-level anchor for notes.

---

## User Stories

- As a **Reader**, I want imported tables, diagrams, lists, and code examples preserved, so that the article's argument stays intact.
- As a **Reader**, I want every heading kept, so that lists and paragraphs keep the labels that give them meaning.
- As a **Reader**, I want to annotate a heading, list, code block, table, or figure, so that I can attach notes at the level the idea lives.
- As a **Reader**, I want diagrams shown at their true proportions, with a way to see them at original size when they are too small to read.
- As a **Reader**, I want confidence that no visible article text is silently dropped.

---

## Functional Requirements

### Block model

1. **Kinds.** Each `paragraphs[]` entry gains an optional `kind`: `"text"` (default — existing articles are unchanged), `"heading"`, `"list"`, `"code"`, `"table"`, or `"figure"`. `index` remains the annotation `blockId` for every kind; every kind is annotatable.

### Content root

2. **Content-root selection.** Root is `.body-block` if present (churchofjesuschrist.org, unchanged). Otherwise, within the first of `<article>` → `<main>` → `<body>`, the importer picks the **densest content container**: the descendant element with the highest score, where score = total text length of its *direct* children that are `<p>`, `<h1>`–`<h6>`, `<ul>`/`<ol>`, `<pre>`, `<table>`, `<figure>`, or `<blockquote>`. Ties go to the outermost element. If the best score is < 500 characters, the fallback element itself is the root. (Rationale: on the reference page `<main>` also contains the hero, category/product tags, "Copy link", author bio, and a related-posts carousel; the densest container is the `.w-richtext` article body.)

### Extraction

3. **Document order.** The importer walks the content root in document order and emits blocks for: `<p>`, `<h1>`–`<h6>`, outermost `<ul>`/`<ol>`, `<pre>`, `<table>`, `<figure>`, standalone `<img>`, inline `<svg>` (FR-11), and uncovered text (FR-14). Text inside an emitted block is never emitted again as a separate block (e.g. `<p>` inside `<li>`, `<td>`, or `<figcaption>`).

4. **Headings.** `heading: { level: 2 | 3 | 4 | 5 | 6 }`; `text` = the heading's plain text. An `<h1>` inside the body is stored as level 2 (the article title is the page's only `<h1>`). Empty headings are skipped.

5. **Lists.** One block per outermost list (a note attaches to the whole list, consistent with PDF list handling). `list: { ordered: boolean; start: number; items: ListItem[]; truncated?: boolean }` where `ListItem = { text: string; children?: ListItem[] }`.
   - `start` from `<ol start>`, default 1; `reversed` is ignored.
   - Item text = the `<li>`'s plain text excluding nested lists; inline `<code>` kept as text; multiple `<p>` within one item joined with a space.
   - Nesting preserved to depth 3; deeper items are placed at depth 3.
   - Empty items dropped; a list with no items is skipped. Cap 200 items per list → `truncated: true`.
   - `text` = flattened form: `1. item` / `- item` per line, nested items indented two spaces per level.

6. **Code blocks.** One block per `<pre>`. `code: { language: string | null; content: string; truncated?: boolean }`.
   - `content` = the `<pre>`'s `textContent` (syntax-highlighting spans discarded), whitespace, tabs, and newlines preserved exactly; only a single trailing newline is trimmed.
   - `language` from a `language-*` or `lang-*` class on `<code>` or `<pre>`, lowercased, accepted only if it matches `^[a-z0-9+#-]{1,20}$`, else `null`.
   - Whitespace-only `<pre>` is skipped. Cap 20,000 characters → `truncated: true`.
   - `text` = `content`. Inline `<code>` outside `<pre>` remains inline text in its parent block.

7. **Tables.** `table: { headers: string[]; rows: string[][]; truncated?: boolean }`, all plain text.
   - Links and markup stripped; inline `<code>` kept as text; a list inside a cell is flattened with `; ` between items.
   - Headers from `<thead>` or an all-`<th>` first row; otherwise `headers: []`.
   - `colspan`/`rowspan`: text placed in the first spanned cell; the other spanned cells are empty strings.
   - Cap 50 rows × 12 columns → `truncated: true`. Tables with no non-whitespace text are skipped.
   - `text` = flattened form, one row per line as `header: cell; header: cell` (or `cell; cell` when there are no headers).

### Figures

8. **Storage.** Every image is downloaded (raster, or `<img src="….svg">`) or serialized (inline SVG) and stored write-once at `content/assets/<sha256>.<ext>` (`If-None-Match: *`; 412 treated as success). The source CDN is never hotlinked. `figure: { assetKey, format, width, height, alt, caption, unavailable? }`.
   - `caption` from `<figcaption>`, else the SVG's `<title>` or `aria-label`, else empty string.
   - `text` = caption, else `alt`, else `"Figure"`.

9. **Original dimensions.** `width`/`height` are the intrinsic size in px.
   - Raster: read from the file header (PNG IHDR, JPEG SOF, GIF, WebP).
   - SVG: absolute `width`/`height` attributes (px or unitless); otherwise the `viewBox` width/height. If only a `viewBox` exists, the sanitizer writes explicit `width`/`height` into the stored SVG so `<img>` rendering preserves the ratio.
   - An SVG whose dimensions cannot be determined (e.g. only `%`/`em` sizes and no `viewBox`) is unavailable (FR-13).

10. **Fetch safety.** Only `https:` image URLs. Hosts resolving to private, loopback, or link-local addresses are refused, re-checked on every redirect; max 3 redirects; 10s timeout per image; concurrency 4. Format verified by magic bytes (`png`, `jpeg`, `gif`, `webp`) or by a parseable `<svg>` root — never by `Content-Type` alone. Caps: 5 MB per raster, 2 MB per SVG, 20 figures per article.

11. **SVG sanitization.** Every SVG (inline or fetched) is sanitized server-side with DOMPurify on the existing `jsdom`, SVG profile.
    - Removed: `<script>`, `<foreignObject>`, `<iframe>`/`<embed>`/`<object>`, all `on*` attributes, and `<animate>`/`<set>` targeting `href`.
    - `href`/`xlink:href` allowed only as `#fragment` or `data:image/(png|jpeg|gif|webp);base64,…`.
    - In `<style>` and attributes, only `url(#id)` references survive; `@import` removed.
    - `xmlns="http://www.w3.org/2000/svg"` added if missing.
    - If nothing drawable remains, the figure is unavailable.

12. **Decorative SVG exclusion.** An inline SVG is not emitted (and contributes no text) if it has `aria-hidden="true"` or `role="presentation"`/`"none"`, is inside `<a>` or `<button>`, or both intrinsic dimensions are ≤ 64 px. This excludes the reference article's 44×44 callout icons.

13. **Soft failure.** Any image fetch, validation, sizing, or sanitization failure — or exceeding the 20-figure cap — still imports the article. The block keeps its caption/alt with `unavailable: true`, `assetKey: null`, `format: null`, `width: null`, `height: null`; the UI shows an "Image unavailable" placeholder.

### Catch-all text

14. **No visible text dropped.** After structured extraction, any text in the content root not covered by an emitted block becomes a `text` block.
    - Grouping: each maximal run of uncovered inline content (text nodes and inline elements) under the same nearest block-level ancestor (`div`, `section`, `blockquote`, `aside`, `details`, `dt`, `dd`, etc.) is one block, in document order. Block-level boundaries split runs.
    - Whitespace collapsed to single spaces and trimmed; whitespace-only runs skipped.
    - **Excluded** (never emitted, by catch-all or any other rule): `<script>`, `<style>`, `<noscript>`, `<template>`, `<button>`, form controls (`<input>`, `<select>`, `<textarea>`, `<label>`), `<nav>`, `<footer>`, footnote containers (`[role="doc-endnotes"]`, `[role="doc-footnote"]`, `.footnotes`) per the constitution's footnote-stripping rule, and hidden content (`hidden` attribute, `aria-hidden="true"`, inline `display:none` or `visibility:hidden`).
    - **Leading-label separator**: when a `<small>`, `<b>`, or `<strong>` element is the first content of a run (catch-all) or of a block's text (`textOf`), and the text after it starts with an uppercase letter or digit, a space is inserted after it. This covers labels rendered on their own line only via CSS (reference `sd-vs`: `<small>Traditional</small>An idea…` → "Traditional An idea…"). Mid-run elements (`marker<sup>1</sup>.`) and lowercase continuations (`<b>Un</b>believable`) stay joined.
    - This covers the reference article's callout and embed boxes (`.sd-key`, `.sd-side`, `.sd-res`, …) and definition lists (`<dt>`/`<dd>` each become a text block).

### Hashing and versioning

15. **Content hash.** `articleId = SHA-256` of the block `text` values joined with `\n\n`; each figure block additionally contributes `figure:<asset sha256>` (or `figure:unavailable`) so a changed diagram yields a new version. A page whose content root holds only `<p>` produces exactly the same `articleId` as today.

16. **Re-import.** Pages with any newly captured content produce different blocks and therefore a different `articleId`, routed through the existing `NEW_VERSION` confirm flow. Old annotations remain on the old version (block indices shift). No backfill.

### Rendering (`ParagraphList`, `ArticleViewPage`)

17. **Headings** render with their matching tag (`<h2>`–`<h6>`); distinct sizes for levels 2–4, with 5 and 6 styled like 4. Standard "+" annotation affordance.

18. **Lists** render as `<ul>` or `<ol start>` with nesting; "+" affordance on the whole list.

19. **Code** renders as `<pre><code>`, monospace, whitespace preserved, horizontal scroll (no wrapping), a language label when `language` is set, and a "Copy" button that copies `content` and shows "Copied" for 2 s ("Copy failed" if clipboard access is denied). No syntax highlighting.

20. **Tables** render in a bordered container that scrolls horizontally on narrow screens; cells are plain text.

21. **Truncation notes**: "Table truncated (showing first 50 rows / 12 columns)", "List truncated (showing first 200 items)", "Code truncated (showing first 20,000 characters)".

22. **Figure display.** `<img loading="lazy">` with `alt`, `width`, and `height` attributes; CSS `aspect-ratio: width / height`, `width: min(100%, {width}px)`, `height: auto`. Never cropped, stretched, or upscaled beyond intrinsic width. Caption rendered as `<figcaption>`.

23. **"View original size."** Shown on any figure (raster or SVG) whose rendered width is < 75% of its intrinsic width, measured on the actual rendered element and re-evaluated on resize (`ResizeObserver`). It opens a modal that renders the image at exactly intrinsic `width × height` CSS px, scrollable on both axes starting top-left, with the caption and an "Open in new tab" link to the asset. Closes on Esc, close button, or backdrop click; focus is trapped while open and returned to the trigger on close.

### Ancillary

24. **Out-of-context block text.** Where a block's content is quoted outside the article view (the Past Entry page's block excerpt above each annotation), it shows the block's `text`, prefixed `List:`, `Code:`, `Table:`, or `Figure:` (headings and text unprefixed). Note-history block labels (`¶ N`) are unchanged. Browse Articles search is unaffected — it matches title and source URL only, not body text.

25. **Serving.** Assets served via dedicated `/content/assets/*.svg` and `/content/assets/*` CloudFront behaviours (same origin and cache settings as `/content/*`, ordered before it — a single behaviour cannot vary headers by extension) with long-lived caching (immutable, content-addressed). Their response-headers policies add `X-Content-Type-Options: nosniff`, and for SVG `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; img-src data:` (protects the "Open in new tab" path). Lambda IAM gains `s3:PutObject` on `content/assets/*`.

26. **Unchanged modes.** Manual-paste and PDF import modes are unchanged (text only).

---

## Error States & Edge Cases

| Scenario | What Happens |
|----------|-------------|
| Image 404, timeout, private host, bad magic bytes, over size cap | Figure kept with caption, `unavailable: true`, placeholder; import succeeds |
| More than 20 figures | First 20 stored; remainder unavailable with captions |
| SVG with only `%`/`em` sizing and no `viewBox` | Unavailable ("dimensions unknown") |
| SVG uses `currentColor` or host-page CSS variables | Stored as-is; colours may fall back to defaults since `<img>` doesn't inherit page CSS (accepted limitation) |
| SVG `<use>` referencing an external sprite | Reference stripped; unavailable if nothing drawable remains |
| Decorative inline SVG (aria-hidden, in a link/button, ≤ 64 px) | Not emitted |
| Very wide diagram on mobile (2400×600 at 343 px) | Rendered 343×86 (ratio preserved); "View original size" shown |
| Figure rendered at ≥ 75% of intrinsic width | No "View original size" button |
| Same image used twice | One S3 object, two blocks |
| Concurrent imports writing the same asset | `If-None-Match: *`; 412 treated as success |
| `<pre>`, table, or figure inside a list item | Flattened to plain text (whitespace collapsed) inside that item; no separate block |
| List inside a table cell | Flattened into cell text with `; ` separators |
| `<pre>` without a `<code>` child | Still a code block; `language` from `<pre>` class or `null` |
| Unknown/garbage language class | `language: null`; no label |
| `<ol reversed>` | Ignored; numbers ascend from `start` |
| Empty heading, list, table, or whitespace-only `<pre>` | Skipped |
| `<h1>` inside the body | Stored as heading level 2 |
| Callout `<div>` with icon + text | Icon excluded (FR-12); text emitted via catch-all (FR-14) |
| Text inside `<nav>`, `<footer>`, `<button>`, `<style>`, hidden elements, footnote containers | Never emitted |
| Content root fallback has no dense container (best score < 500 chars) | Fallback element (`article`/`main`/`body`) used as root, as today |
| Clipboard permission denied on Copy | "Copy failed"; nothing else changes |
| Manual-paste or PDF import | Unchanged; text-only blocks |

---

## Data Model

### `ArticleParagraph` — `src/types/article.ts`

```typescript
type ListItem = { text: string; children?: ListItem[] };   // depth ≤ 3

interface ArticleParagraph {
  index: number;                         // 0-indexed; annotation blockId
  text: string;                          // min(1); flattened text for non-text kinds
  kind?: "text" | "heading" | "list" | "code" | "table" | "figure"; // default "text"
  heading?: { level: 2 | 3 | 4 | 5 | 6 };
  list?: { ordered: boolean; start: number; items: ListItem[]; truncated?: boolean };
  code?: { language: string | null; content: string; truncated?: boolean };
  table?: { headers: string[]; rows: string[][]; truncated?: boolean };
  figure?: {
    assetKey: string | null;             // "content/assets/<sha256>.<ext>"
    format: "png" | "jpeg" | "gif" | "webp" | "svg" | null;
    width: number | null;                // intrinsic px; null only when unavailable
    height: number | null;
    alt: string;
    caption: string;
    unavailable?: boolean;
  };
}
```

Zod refinements:
- The payload matching `kind` is required; payloads for other kinds must be absent. `kind` absent or `"text"` → no payload.
- `figure.unavailable !== true` ⇒ `assetKey`, `format`, `width`, `height` all non-null; `width`/`height` positive integers.

`Article` is otherwise unchanged. Existing stored articles (no `kind`) validate and render exactly as before.

### Asset — `content/assets/<sha256>.<ext>`

- `sha256` of the stored bytes (post-sanitization for SVG), lowercase hex; `ext` ∈ `png | jpg | gif | webp | svg`.
- Write-once, immutable, shared (same scope as articles).

---

## API Contract

No new endpoints. `POST /articles/import` request and response shapes are unchanged; only the stored `Article.paragraphs` content is richer. Import latency budget changes (see NFRs).

---

## Acceptance Criteria

Reference fixture: the saved HTML of the reference article, committed as a test fixture.

### Happy Path

- [ ] Content root for the reference fixture is the `.w-richtext` article body; no hero, category/product tag, "Copy link", author-bio, or related-posts text appears in any block.
- [ ] Heading blocks match the body's 10 `h2`, 21 `h3`, and 38 `h4` in document order with correct `level`; e.g. each play's "How to execute it" (level 4) immediately precedes its steps list.
- [ ] 19 `list` blocks (all single-level), ordered/unordered matching the source, in document order.
- [ ] 13 `code` blocks with languages markdown ×6, javascript ×3, yaml ×2, json ×1, bash ×1; each `content` matches the source text byte-for-byte including whitespace.
- [ ] One `table` block with headers `Stage`, `Traditional SDLC`, `AI-native SDLC` and 6 rows.
- [ ] 4 `figure` blocks: 3 with captions matching the source, 1 with `text: "Figure"`; assets stored under `content/assets/` and rendered via CloudFront.
- [ ] The 2 `.sd-key` callouts and other `sd-*` embed boxes produce `text` blocks containing their text; the callout icons (viewBox `0 0 44 44`, no width/height, `aria-hidden`) produce no blocks.
- [ ] **No-loss property**: every non-whitespace word of visible text in the content root (excluding FR-14 exclusions) appears, in order, in the concatenated block `text` — and no word appears twice due to double extraction.
- [ ] Notes can be added to and displayed on a heading, list, code, table, and figure block.
- [ ] Inline SVG fixture (2400×600 `viewBox`, no width/height) is stored as `.svg` with `width="2400" height="600"`; at a 375 px viewport it renders at 4:1 and shows "View original size".
- [ ] "View original size" opens a modal showing the image at 2400×600, horizontally scrollable; Esc closes it and focus returns to the button.
- [ ] A raster figure keeps its intrinsic ratio at 375 px and 1280 px viewports and is never wider than its intrinsic width.
- [ ] `<ol start="5">` renders numbering from 5; a 4-level nested list fixture is stored as 3 levels with level-4 items at level 3.
- [ ] A code block with long lines scrolls horizontally at 375 px without widening the page; Copy places exactly `content` on the clipboard.
- [ ] Existing stored articles load and render unchanged; a `<p>`-only fixture yields the same `articleId` as the current implementation.

### Error Handling

- [ ] A failed image download still imports the article; the figure shows the "Image unavailable" placeholder with its caption.
- [ ] An SVG with undeterminable dimensions becomes an unavailable figure.
- [ ] More than 20 images: exactly 20 assets stored, remainder unavailable.

### Security

- [ ] An SVG fixture containing `<script>`, `onload=`, `<foreignObject>`, `xlink:href="https://evil.example/…"`, and `style="background:url(https://…)"` is stored with all of them removed.
- [ ] Image fetches to `169.254.169.254`, `127.0.0.1`, `10.0.0.0/8`, or via a redirect to any of them are never made.
- [ ] SVGs render only via `<img>`, never inline; a direct request for a stored SVG returns `nosniff` and the CSP header.
- [ ] Code, list, table, and heading text render as escaped text: a code block containing `<script>alert(1)</script>` displays literally.
- [ ] Text inside `<style>`, `<script>`, `<nav>`, `<footer>`, `<button>`, hidden elements, and footnote containers never appears in any block.

### Edge Cases

- [ ] Re-importing a URL previously imported as text-only returns `NEW_VERSION`; confirming stores a new article with `previousVersionId`, and old annotations remain on the old version.
- [ ] On the Past Entry page, an annotation on a table block shows its excerpt as `Table: …`, and one on a figure shows `Figure: <caption>`.
- [ ] A churchofjesuschrist.org fixture (saved talk HTML) imports with `.body-block` as root and no footnote-container or navigation text in any block.

---

## Non-Functional Requirements

- **Performance**: Import with up to 20 figures completes within 30 s at p95 (image fetches concurrency 4, 10 s each). Verify Lambda timeout and Function URL limits accommodate this.
- **Cost**: ~200 KB average per image; negligible S3/CloudFront cost within the $1/month budget. No new persistent infrastructure beyond an IAM grant and a CloudFront response-headers policy.
- **Accessibility**: Original-size modal is a proper dialog (`role="dialog"`, `aria-modal`, labelled by caption), with focus trap and return; the trigger's accessible name includes the caption; Copy button announces "Copied" via a live region.
- **Testing**: Service-layer unit tests for content-root selection, each block extractor, catch-all, sanitizer, dimension reader, and fetch guard (≥ 80% coverage per constitution). Fixtures: reference article HTML, a churchofjesuschrist.org talk, synthetic SVG/raster/list/code fixtures.
- **Logging**: Structured logs for image failures (`{ level, message, articleId, reason, host }`); no image URLs with query strings logged.

---

## Out of Scope

- Rich content for PDF imports (tables, figures, lists, code, heading kinds) and manual paste.
- Syntax highlighting.
- Per-item annotation within lists (a note attaches to the whole list).
- Zoom/pinch controls beyond the original-size view.
- Alt-text or caption generation.
- Backfilling existing articles (re-import to upgrade).
- Table editing, sorting, or export.
- The article dek/subtitle outside the selected content root.
- Video, audio, and iframe embeds.

---

## Open Questions

| Question | Owner | Resolution |
|----------|-------|------------|
| Relax the plain-text rule? | Peter | Resolved: yes, via ADR |
| Store images or hotlink? | Peter | Resolved: store in `content/assets/` |
| Which headings? | Peter | Resolved: all of `h1`–`h6` (`h1` → level 2) |
| SVG handling? | Peter | Resolved: sanitize, store, display like other figures; preserve ratio; original-size view |
| Lists and code blocks? | Peter | Resolved: included; one block per list |
| Uncovered text? | Peter | Resolved: catch-all rule (FR-14) |
| 75% threshold for "View original size" | Peter | Proposed default; tune after use |
