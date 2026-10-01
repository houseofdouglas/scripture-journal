# Tasks: Rich Article Blocks

**Spec**: [docs/specs/rich-article-blocks.md](../specs/rich-article-blocks.md)
**ADR**: [docs/adr/2026-10-01-rich-article-blocks.md](../adr/2026-10-01-rich-article-blocks.md)
**Created**: 2026-10-01
**Status**: PENDING

New extraction code lives in `src/service/article-extract/`; `src/service/article-import.ts` calls it in place of `parseHtml`.

**Parallel waves** (tasks within a wave are independent):

| Wave | Tasks |
|------|-------|
| 1 | RAB-01, RAB-02, RAB-11, RAB-15 |
| 2 | RAB-03, RAB-09, RAB-12, RAB-16, RAB-20 |
| 3 | RAB-04, RAB-10, RAB-17, RAB-18 |
| 4 | RAB-05, RAB-06, RAB-07, RAB-13, RAB-19 |
| 5 | RAB-08, RAB-21 |
| 6 | RAB-14 |
| 7 | RAB-22 |

---

## Task: RAB-01 — Test: fixtures and baseline article ids

**Layer**: Test
**Estimate**: 1hr
**Depends on**: none
**Status**: PENDING

### What to build
Save test fixtures under `src/service/__tests__/fixtures/html/`: the reference article HTML (`https://claude.com/blog/the-ai-native-sdlc-playbook`), a churchofjesuschrist.org general-conference talk, a `<p>`-only page, and synthetic pages for lists (4-level nesting, `start=5`), code, tables (colspan/rowspan), callouts, and hidden/nav/footer text. Save image fixtures under `.../fixtures/images/`: a 2400×600 viewBox-only SVG, a malicious SVG, an unsizeable SVG (only `%`/`em` sizes, no viewBox), and tiny PNG/JPEG/GIF/WebP files. Run the **current** importer's parse + hash on the `<p>`-only page and the talk and record their `articleId`s as golden values.

### Acceptance criteria
- [ ] All fixtures committed, each with a one-line purpose in `fixtures/README.md`
- [ ] `baseline-ids.json` holds the current-implementation ids for the `<p>`-only page and the talk

### Files expected
- `src/service/__tests__/fixtures/html/*`
- `src/service/__tests__/fixtures/images/*`
- `src/service/__tests__/fixtures/baseline-ids.json`

---

## Task: RAB-02 — Types: block kinds and schemas

**Layer**: Types
**Estimate**: 1hr
**Depends on**: none
**Status**: PENDING

### What to build
Extend `ArticleParagraphSchema` with optional `kind` and the `heading`, `list` (recursive `ListItem`, depth ≤ 3), `code`, `table`, and `figure` payloads per the spec's Data Model. Zod refinements: the payload matching `kind` is required and others absent; an available figure has non-null `assetKey`/`format`/`width`/`height` with positive-integer dimensions. Add `assetKey(sha, ext)` and `ASSET_KEY_PATTERN`.

### Acceptance criteria
- [ ] Existing article JSON (no `kind`) validates unchanged
- [ ] Mismatched payload, two payloads, or an available figure with a null field is rejected
- [ ] A list nested to depth 4 is rejected by the schema

### Files expected
- `src/types/article.ts`
- `src/types/__tests__/article.test.ts`

---

## Task: RAB-03 — Service: content-root selection

**Layer**: Service
**Estimate**: 2hr
**Depends on**: RAB-01
**Status**: PENDING

### What to build
`selectContentRoot(doc)` per FR-2: `.body-block`, else within the first of `article` → `main` → `body` pick the descendant with the highest direct-block-child text score (outermost wins ties); fall back to that element if the best score < 500 chars.

### Acceptance criteria
- [ ] Reference fixture resolves to the `.w-richtext` body; no "Copy link", category tags, or related-posts text is inside it
- [ ] Talk fixture resolves to `.body-block`; a sparse page falls back to `<main>`

### Files expected
- `src/service/article-extract/content-root.ts`
- `src/service/article-extract/__tests__/content-root.test.ts`

---

## Task: RAB-04 — Service: block walker, text and headings

**Layer**: Service
**Estimate**: 2hr
**Depends on**: RAB-02, RAB-03
**Status**: PENDING

### What to build
`extractBlocks(root)`: a single document-order pass with a handler registry and a "covered" set so nothing is emitted twice (FR-3). Implements `<p>` and `h1`–`h6` (h1 → level 2, FR-4). Applies the FR-14 exclusion list globally. Exposes handler hooks for list, code, table, figure, and catch-all (later tasks); figures are emitted as unresolved `PendingFigure` entries.

### Acceptance criteria
- [ ] Reference fixture yields 10 / 21 / 38 heading blocks for h2 / h3 / h4, in order, correct `level`
- [ ] `<p>` inside `<td>`, `<li>`, or `<figcaption>` is not emitted separately
- [ ] Excluded elements (script, style, nav, footer, button, hidden, footnote containers) contribute no text

### Files expected
- `src/service/article-extract/blocks.ts`
- `src/service/article-extract/exclusions.ts`
- `src/service/article-extract/__tests__/blocks.test.ts`

---

## Task: RAB-05 — Service: list extraction

**Layer**: Service
**Estimate**: 2hr
**Depends on**: RAB-04
**Status**: PENDING

### What to build
FR-5: one block per outermost list; `ordered`, `start`; item text excludes nested lists, multiple `<p>` joined with a space; depth clamped to 3; nested `pre`/table/figure flattened to text; cap 200 items → `truncated`; flattened `text` form.

### Acceptance criteria
- [ ] Reference fixture yields 19 list blocks, ordered/unordered matching source
- [ ] 4-level fixture stored as 3 levels; `start=5` preserved; empty items and empty lists dropped

### Files expected
- `src/service/article-extract/list.ts`
- `src/service/article-extract/__tests__/list.test.ts`

---

## Task: RAB-06 — Service: code-block extraction

**Layer**: Service
**Estimate**: 1hr
**Depends on**: RAB-04
**Status**: PENDING

### What to build
FR-6: `content` with whitespace preserved exactly (single trailing newline trimmed); `language` from `language-*`/`lang-*` on `<code>` or `<pre>` matching `^[a-z0-9+#-]{1,20}$`, else `null`; cap 20,000 chars → `truncated`; whitespace-only `<pre>` skipped.

### Acceptance criteria
- [ ] Reference fixture yields 13 code blocks: markdown ×6, javascript ×3, yaml ×2, json ×1, bash ×1
- [ ] Each `content` matches the fixture source byte-for-byte
- [ ] Garbage class → `null`; `<pre>` without `<code>` handled

### Files expected
- `src/service/article-extract/code.ts`
- `src/service/article-extract/__tests__/code.test.ts`

---

## Task: RAB-07 — Service: table extraction

**Layer**: Service
**Estimate**: 2hr
**Depends on**: RAB-04
**Status**: PENDING

### What to build
FR-7: headers from `<thead>` or an all-`<th>` first row; colspan/rowspan placement (text in first spanned cell, others empty); lists in cells flattened with `; `; cap 50 rows × 12 columns → `truncated`; empty tables skipped; flattened `text` form.

### Acceptance criteria
- [ ] Reference table: headers `Stage` / `Traditional SDLC` / `AI-native SDLC`, 6 rows
- [ ] Span fixture produces correct cell positions; a 60-row table truncates to 50 with `truncated: true`

### Files expected
- `src/service/article-extract/table.ts`
- `src/service/article-extract/__tests__/table.test.ts`

---

## Task: RAB-08 — Service: catch-all text and no-loss property

**Layer**: Service
**Estimate**: 2hr
**Depends on**: RAB-05, RAB-06, RAB-07
**Status**: PENDING

### What to build
FR-14: after the structured handlers, each maximal run of uncovered inline content under the same nearest block-level ancestor becomes a `text` block; whitespace collapsed; `<dt>`/`<dd>` become separate blocks. Add the no-loss property test: every visible word in the content root (minus exclusions) appears exactly once, in order, across concatenated block `text`.

### Acceptance criteria
- [ ] Reference fixture's 2 `.sd-key` callouts and other `sd-*` embed boxes (`sd-side`, `sd-res`, `sd-band`, …) become text blocks
- [ ] No-loss property passes on the reference and talk fixtures
- [ ] Hidden, nav, and footnote-container text never appears

### Files expected
- `src/service/article-extract/catch-all.ts`
- `src/service/article-extract/__tests__/catch-all.test.ts`
- `src/service/article-extract/__tests__/no-loss.test.ts`

---

## Task: RAB-09 — Service: image info reader

**Layer**: Service
**Estimate**: 1hr
**Depends on**: RAB-01
**Status**: PENDING

### What to build
`readImageInfo(bytes)` → `{ format, width, height } | null`: magic-byte detection plus header parsing for PNG (IHDR), JPEG (SOF scan), GIF, WebP (VP8/VP8L/VP8X); SVG via absolute `width`/`height` else `viewBox`. No new dependency.

### Acceptance criteria
- [ ] Each raster fixture reports correct dimensions
- [ ] viewBox-only SVG → 2400×600; `%`/`em`-only SVG → `null`
- [ ] A text file named `.png` is rejected

### Files expected
- `src/service/article-extract/image-info.ts`
- `src/service/article-extract/__tests__/image-info.test.ts`

---

## Task: RAB-10 — Service: SVG sanitizer

**Layer**: Service
**Estimate**: 2hr
**Depends on**: RAB-09
**Status**: PENDING

### What to build
Add the `dompurify` dependency. `sanitizeSvg(svgString)` on the existing jsdom per FR-11: strip script, `foreignObject`, iframe/embed/object, `on*`, href-targeting animation; restrict `href` to `#fragment` or base64 raster data URIs; strip non-fragment `url()` and `@import`; add `xmlns`; write `width`/`height` from `viewBox` when missing; return `null` if nothing drawable remains.

### Acceptance criteria
- [ ] Malicious fixture output contains none of the listed vectors
- [ ] A benign diagram fixture keeps its shapes and text
- [ ] An SVG consisting only of an external `<use>` returns `null`

### Files expected
- `src/service/article-extract/svg-sanitize.ts`
- `src/service/article-extract/__tests__/svg-sanitize.test.ts`
- `package.json`

---

## Task: RAB-11 — Service: SSRF-safe image fetcher

**Layer**: Service
**Estimate**: 2hr
**Depends on**: none
**Status**: PENDING

### What to build
`fetchImage(url, { maxBytes })` per FR-10: HTTPS only; DNS-resolve and refuse private, loopback, and link-local ranges (IPv4 and IPv6); manual redirect following (max 3) with re-check; 10 s timeout; streamed size cap (5 MB raster / 2 MB SVG). Structured logs `{ level, message, host, reason }` without query strings.

### Acceptance criteria
- [ ] `169.254.169.254`, `127.0.0.1`, `10.x`, `::1`, and a redirect to any of them are refused before connecting
- [ ] `http:` refused; oversized body aborted; timeout yields a typed failure

### Files expected
- `src/service/article-extract/image-fetch.ts`
- `src/service/article-extract/__tests__/image-fetch.test.ts`

---

## Task: RAB-12 — Repository: asset store

**Layer**: Repository
**Estimate**: 1hr
**Depends on**: RAB-02
**Status**: PENDING

### What to build
`putAsset(bytes, ext, contentType)`: sha256 → `content/assets/<sha>.<ext>`, `PutObject` with `If-None-Match: *`; a 412 is treated as success; returns the key. `Cache-Control: public, max-age=31536000, immutable`.

### Acceptance criteria
- [ ] With mocked S3: new write succeeds; existing object (412) is success; other errors propagate

### Files expected
- `src/repository/asset.ts`
- `src/repository/__tests__/asset.test.ts`

---

## Task: RAB-13 — Service: figure detection and resolution

**Layer**: Service
**Estimate**: 2hr
**Depends on**: RAB-04, RAB-09, RAB-10, RAB-11, RAB-12
**Status**: PENDING

### What to build
Figure handler: `<figure>`, standalone `<img>`, inline `<svg>`, with decorative exclusion (FR-12) and caption/alt sourcing (FR-8). Resolver: for pending figures, concurrency 4 — fetch or serialize → sanitize SVG → read info → `putAsset`. 20-figure cap. Any failure → unavailable block (FR-13).

### Acceptance criteria
- [ ] Reference fixture yields 4 figures (3 captions + `"Figure"`); its 44×44 callout icons are excluded
- [ ] Fetch failure, unsizeable SVG, and the 21st figure become `unavailable`; import still succeeds
- [ ] The same image used twice results in one `putAsset` object

### Files expected
- `src/service/article-extract/figure.ts`
- `src/service/article-extract/__tests__/figure.test.ts`

---

## Task: RAB-14 — Service: hashing and import integration

**Layer**: Service
**Estimate**: 2hr
**Depends on**: RAB-08, RAB-13
**Status**: PENDING

### What to build
Replace `parseHtml` in `article-import.ts` with content root → `extractBlocks` → figure resolution. `articleId` per FR-15 (block texts joined by `\n\n`, figures add `figure:<sha>` / `figure:unavailable`). Duplicate / version / URL-index / article-index flows unchanged. Manual-paste and PDF modes untouched.

### Acceptance criteria
- [ ] `<p>`-only and talk fixtures reproduce the RAB-01 golden ids
- [ ] Re-import of a text-only article returns `NEW_VERSION`; confirm sets `previousVersionId`
- [ ] All existing `article-import` tests pass; service-layer coverage ≥ 80%

### Files expected
- `src/service/article-import.ts`
- `src/service/article-extract/hash.ts`
- `src/service/__tests__/article-import.test.ts`

---

## Task: RAB-15 — Infra: IAM and CloudFront asset headers

**Layer**: Infra
**Estimate**: 1hr
**Depends on**: none
**Status**: PENDING

### What to build
Lambda IAM `s3:PutObject` on `content/assets/*`. Ordered cache behaviours for `/content/assets/*.svg` (response-headers policy: `nosniff` + FR-25 CSP) and `/content/assets/*` (`nosniff`), placed before the existing `/content/*` behaviour (CloudFront cannot vary headers by extension within one behaviour).

### Acceptance criteria
- [ ] `terraform validate` passes; `terraform plan` shows only the IAM change and the new behaviours/policies
- [ ] After dev apply, `curl -I` on a stored SVG shows `nosniff` and the CSP

### Files expected
- `infra/lambda.tf`
- `infra/cloudfront.tf`

---

## Task: RAB-16 — UI: block renderers (headings, lists, tables)

**Layer**: UI
**Estimate**: 2hr
**Depends on**: RAB-02
**Status**: PENDING

### What to build
`ParagraphList` dispatches on `kind`, keeping the existing "+" and saved-annotation wrapper around every block. Add `HeadingBlock` (`<h2>`–`<h6>`, sizes for levels 2–4, 5–6 styled as 4), `ListBlock` (nested `<ul>` / `<ol start>`), `TableBlock` (horizontal-scroll container), and the FR-21 truncation notes. Text paragraphs render exactly as before.

### Acceptance criteria
- [ ] Each kind renders the correct semantic tags; a `<script>` string in any field renders literally
- [ ] Table at 375 px scrolls within its container without page overflow
- [ ] Existing `ParagraphList` tests pass unchanged

### Files expected
- `src/ui/components/ParagraphList.tsx`
- `src/ui/components/blocks/heading-block.tsx`, `list-block.tsx`, `table-block.tsx`
- `src/ui/components/blocks/__tests__/*`

---

## Task: RAB-17 — UI: code block with Copy

**Layer**: UI
**Estimate**: 1hr
**Depends on**: RAB-16
**Status**: PENDING

### What to build
`CodeBlock`: `<pre><code>` monospace, no wrap, horizontal scroll; language label when known; Copy button → "Copied" for 2 s or "Copy failed", announced via a live region.

### Acceptance criteria
- [ ] Copy calls `navigator.clipboard.writeText` with the exact `content`
- [ ] Clipboard rejection shows "Copy failed"; no label when `language` is null

### Files expected
- `src/ui/components/blocks/code-block.tsx`
- `src/ui/components/blocks/__tests__/code-block.test.tsx`

---

## Task: RAB-18 — UI: figure block

**Layer**: UI
**Estimate**: 1hr
**Depends on**: RAB-16
**Status**: PENDING

### What to build
`FigureBlock` per FR-22: `<img loading="lazy">` with `alt`/`width`/`height`, CSS `aspect-ratio: W / H`, `width: min(100%, Wpx)`, `height: auto`; `<figcaption>`; "Image unavailable" placeholder when `unavailable`. Asset URL is `/<assetKey>` via CloudFront.

### Acceptance criteria
- [ ] Rendered aspect ratio equals width/height at 375 and 1280 px
- [ ] Never wider than intrinsic width
- [ ] Unavailable figure shows placeholder and caption

### Files expected
- `src/ui/components/blocks/figure-block.tsx`
- `src/ui/components/blocks/__tests__/figure-block.test.tsx`

---

## Task: RAB-19 — UI: "View original size" modal

**Layer**: UI
**Estimate**: 2hr
**Depends on**: RAB-18
**Status**: PENDING

### What to build
`ResizeObserver`-driven trigger when rendered width < 75% of intrinsic width. `FigureViewerModal` renders the image at exactly intrinsic `W × H` CSS px, scrollable on both axes from top-left, with caption and "Open in new tab"; Esc / close button / backdrop close; focus trap and return. Reuse the `NoteHistoryModal` dialog pattern.

### Acceptance criteria
- [ ] Trigger shown for 2400 px intrinsic rendered at 343 px; hidden for 400 px at 400 px; updates on resize
- [ ] Modal image is 2400×600; Esc closes and focus returns to the trigger
- [ ] `role="dialog"`, `aria-modal`, labelled by caption

### Files expected
- `src/ui/components/FigureViewerModal.tsx`
- `src/ui/components/blocks/figure-block.tsx`
- `src/ui/components/__tests__/FigureViewerModal.test.tsx`

---

## Task: RAB-20 — UI: Past Entry excerpt prefixes

**Layer**: UI
**Estimate**: 30min
**Depends on**: RAB-02
**Status**: PENDING

### What to build
`PastEntryPage` block excerpts use block `text` with `List:` / `Code:` / `Table:` / `Figure:` prefixes (FR-24), via a small pure helper.

### Acceptance criteria
- [ ] Annotation on a table → `Table: …`; on a figure → `Figure: <caption>`; heading and text unprefixed

### Files expected
- `src/ui/pages/PastEntryPage.tsx`
- `src/ui/lib/block-excerpt.ts`
- `src/ui/lib/__tests__/block-excerpt.test.ts`

---

## Task: RAB-21 — Test: E2E rich article view

**Layer**: Test
**Estimate**: 2hr
**Depends on**: RAB-17, RAB-19, RAB-20
**Status**: PENDING

### What to build
Playwright spec using a mocked article JSON containing every block kind: annotate a heading, list, code, table, and figure; at 375 px verify table and code scroll inside their containers and the page has no horizontal overflow; exercise the original-size modal; verify the unavailable-figure placeholder.

### Acceptance criteria
- [ ] New spec passes in chromium; existing suites don't regress

### Files expected
- `e2e/rich-article.spec.ts`
- `e2e/fixtures/rich-article.json`
- `e2e/helpers/mocks.ts`

---

## Task: RAB-22 — Deploy and smoke-test the reference import

**Layer**: Test
**Estimate**: 1hr
**Depends on**: RAB-14, RAB-15, RAB-21
**Status**: PENDING

### What to build
Deploy to dev. Import the reference URL and a churchofjesuschrist.org talk; verify against the spec's acceptance criteria and record results via `/check-acceptance`.

### Acceptance criteria
- [ ] Reference article imports in < 30 s with all block counts matching the spec; diagrams load from `/content/assets/`
- [ ] Talk import shows no nav or footnote text

### Files expected
- `docs/plans/completed/rich-article-blocks-acceptance-<date>.md`
