# Test fixtures

Fixtures for the rich-article-blocks feature (see `docs/specs/rich-article-blocks.md`, task RAB-01).

## Existing

- `textract-strategy-article.json` — pre-existing PDF-extract fixture (not part of RAB-01).

## html/

- `reference-ai-native-sdlc.html` — Saved copy of https://claude.com/blog/the-ai-native-sdlc-playbook (fetched 2026-10-01). All `<script>` elements removed; nothing else changed. Used to test content-root selection and every block extractor against a real page.
- `talk.html` — Unmodified copy of https://www.churchofjesuschrist.org/study/general-conference/2024/10/57nelson?lang=eng ("The Lord Jesus Christ Will Come Again"), fetched 2026-10-01 with `User-Agent: ScriptureJournal/1.0`. Tests `.body-block` root selection, footnote and navigation exclusion, and the baseline id. Note: jsdom logs a "Could not parse CSS stylesheet" error for one inline `<style>`; it does not affect parsing.
- `p-only.html` — Paragraph-only `<article>` with inline markup, entities, a `<sup>`, whitespace and empty `<p>`s, plus header/footer outside the article. Baseline id fixture: must keep the same `articleId` as the current importer.
- `lists.html` — Lists: 4-level nesting (`#nested-four`, to be flattened to 3), `<ol start="5">`, empty items, an all-empty list, `<p>` inside `<li>`, and `<pre>` inside `<li>`.
- `code.html` — Code blocks: `language-*` and `lang-*` on `<code>`, a language class on `<pre>`, `<pre>` without `<code>`, a garbage class (`language-` with no value), whitespace-only pre, tabs and leading indentation, and escaped `<script>alert(1)</script>` text inside code.
- `tables.html` — Tables: `<thead>`, all-`<th>` first row, no header, colspan/rowspan (`#spans`), a list in a cell, an empty table and an empty-cells table, a 60-row table (truncation to 50), and a 14-column table.
- `callouts-hidden.html` — Callout divs with an icon svg plus bare text (and one without an icon); content hidden via `hidden`, `aria-hidden`, and `style="display:none"`; `nav`, `footer`, `button`, `style`, `noscript`, a `.footnotes` container, and a `<dl>`.

### Verified counts for `reference-ai-native-sdlc.html`

Measured with jsdom inside the article body, `div.u-rich-text-blog.w-richtext[data-readtime="content"]`. The first match is the body. A second, empty `data-readtime="content"` div and a third, empty `.w-condition-invisible` div also exist.

| Item | Count |
|---|---|
| `h2` | 10 (Code is no longer the bottleneck, What is an AI-native SDLC?, Plays, Plan, Design, Build, Test, Deploy, Maintain, Closing thoughts) |
| `h3` | 21 |
| `h4` | 38 |
| Lists (`ul`/`ol`) | 19, all top-level, none nested (14 `ol`, 5 `ul`) |
| `<pre>` | 13: markdown ×6, javascript ×3, yaml ×2, json ×1, bash ×1 |
| `<table>` | 1: header `Stage / Traditional SDLC / AI-native SDLC`, 6 `tbody` rows |
| `<figure>` | 4 (3 with `<figcaption>`) |
| `.sd-key` callouts | 2, each with one `aria-hidden="true"` svg, `viewBox="0 0 44 44"`, no width/height attributes |

Elsewhere in `<main>` but outside the body: an empty `h2.w-dyn-bind-empty`, "Related posts", and "Transform how your organization operates". Other `sd-*` containers in the body (inside `div.w-embed`): `sd-pdf`, `sd-btn`, `sd-toc`, `sd-tbl`, 6× `sd-band`, 2× `sd-side`, `sd-res`, `sd-close`.

## images/

- `wide-viewbox.svg` — `viewBox="0 0 2400 600"`, no width/height; shapes plus `<text>`. Should be stored with `width="2400" height="600"`.
- `malicious.svg` — `<script>` (inline and `xlink:href`), `onload=`/`onclick=`, `<foreignObject>` with an iframe, `xlink:href="https://evil.example/x"` on `<a>` and `<image>`, `style="background:url(https://evil.example/y)"`, and `<style>@import url(https://evil.example/z.css)</style>`. The benign `rect#benign` must survive.
- `unsizeable.svg` — `width="100%" height="5em"` and no viewBox, so it has no dimensions to read.
- `external-use.svg` — Only `<use href="https://evil.example/sprite.svg#a"/>`, an external reference.
- `benign-diagram.svg` — Safe diagram (rects, lines, text, `<g transform>`, a marker, a gradient, an internal `<use href="#dot">`). Shapes and text must be kept after sanitizing.
- `tiny.png` — Real PNG, **3×2**.
- `tiny.jpg` — Real baseline JPEG, **5×4**.
- `tiny.gif` — Real GIF, **7×3**.
- `tiny.webp` — Real WebP, **6×5**, lossless (`VP8L` chunk).
- `fake.png` — Plain text with a `.png` extension. Magic-byte checks must reject it.

Rasters were generated with Python Pillow 12.2.0. Dimensions were confirmed by reopening each file.

## baseline-ids.json

The `articleId` values produced by the importer before this feature, for `html/p-only.html` and `html/talk.html`. Each id is the SHA-256 of the `<p>` texts under `.body-block` → `article` → `main` → `body`, trimmed and joined with `\n\n`. They were checked against the real `importArticle()`, with fetch and the repository mocked.
