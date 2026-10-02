# ADR: Rich Article Blocks and Locally Stored Article Assets

**Date**: 2026-10-01
**Status**: Accepted
**Spec**: [rich-article-blocks](../specs/rich-article-blocks.md)

## Context

Since the initial architecture, imported source content has been **plain text only** (AGENTS.md: "footnotes, hyperlinks, and cross-references from imported articles are stripped"). The URL importer extracts `<p>` elements and nothing else.

That was adequate for churchofjesuschrist.org talks, which are almost entirely paragraphs. It fails for structured articles. The motivating reference — *The AI-Native SDLC Playbook* (claude.com) — loses 69 headings, 19 lists, 13 code blocks, a comparison table, four diagrams, and callout boxes whose text sits outside `<p>` on import. What remains reads as disconnected paragraphs; the article's structure and argument are gone, and the Reader cannot anchor a note to a section, list, table, or diagram.

Two constraints from the constitution are in tension with fixing this:

1. "Source content is plain text only."
2. The storage layout has no place for binary assets.

## Decision

### 1. Relax "plain text only" to "structured, no markup"

Article blocks may carry **structured** content in addition to plain text:

- `heading` (levels 2–6), `list` (nested ≤ 3), `code` (preserved whitespace + language), `table` (headers + rows), and `figure` (stored image + caption/alt).
- Every block retains a plain-text `text` field used for hashing, search, and excerpts.

What remains forbidden:

- **No stored HTML or markup.** All structured payloads are plain strings in typed JSON; the UI renders them through React (escaped). Hyperlinks remain stripped.
- **Footnotes and cross-references remain stripped**, including footnote containers that a catch-all extraction might otherwise pick up.
- SVG is the only markup-bearing format stored, and only as a sanitized, standalone image asset rendered through `<img>` — never inlined into the DOM.

The AGENTS.md key constraint becomes: *"Source content is structured plain text (headings, lists, code, tables, captions) plus locally stored, sanitized images. No stored HTML; footnotes, hyperlinks, and cross-references are stripped."*

### 2. Store images locally, content-addressed

Images referenced by imported articles are downloaded (or, for inline SVG, serialized and sanitized) and stored under a new shared prefix:

```
s3://{bucket}/
├── content/
│   ├── scripture/<work>/<book>/<chapter>.json
│   ├── articles/<articleId>.json
│   ├── articles/url-index/<sha256-of-url>.json
│   └── assets/<sha256>.<ext>          # NEW — write-once, immutable
...
```

- `<sha256>` is the hash of the stored bytes (post-sanitization for SVG); `<ext>` ∈ `png | jpg | gif | webp | svg`.
- Written with `If-None-Match: *`; identical images dedupe naturally.
- Served via dedicated `/content/assets/*` CloudFront behaviours (same settings as `/content/*`) whose response-headers policies add `nosniff` and, for SVG, a restrictive CSP.
- **Never hotlink** the source site: hotlinking reintroduces link rot (the reason articles are copied locally at all) and leaks reading activity to third parties.

### 3. Hash continuity

`articleId` remains SHA-256 of the block texts joined by `\n\n` (figures contribute their asset hash). A paragraph-only article hashes identically to before, so existing content and its annotations are untouched. Articles with newly captured structure get a new `articleId` on re-import and go through the existing version flow; no backfill.

## Rationale

- **Fidelity is the product.** The tool exists to preserve source content for study. Dropping structure silently undermines that more than a modest increase in data-model complexity does.
- **Typed JSON over HTML** keeps the "no stored markup" security posture: nothing from a source site is ever rendered as HTML, so XSS exposure stays limited to the sanitized-SVG path, which is further isolated by `<img>` rendering and CSP.
- **Content-addressed assets fit the existing architecture** — no database, no mutable objects, CDN-cacheable forever, near-zero cost.

## Consequences

- **Data model** (`ArticleParagraph`) gains optional `kind` and per-kind payloads. Old articles validate unchanged.
- **New attack surface**: server-side image fetching (SSRF) and SVG content. Mitigated by the fetch guard (HTTPS only, private-IP refusal re-checked on redirect, size/type caps) and DOMPurify SVG sanitization. These are security-critical code paths and must keep dedicated tests.
- **Storage grows** with binary assets (~200 KB per image typical). Negligible at expected volumes, but `content/assets/` has no garbage collection; orphaned assets (from abandoned versions) are retained indefinitely.
- **Constitution update**: the storage layout in `constitution.md` and the plain-text constraint in `AGENTS.md` are updated to reference this ADR.

## Known tension (resolved)

[ADR 2026-04-21 content-scope](2026-04-21-content-scope-and-scripture-source.md) said that sources not on its allowlist should be `scope=private`, while arbitrary-URL import stored everything as shared. This is resolved by [ADR 2026-10-01 shared-scope-for-imports](2026-10-01-shared-scope-for-imports.md): all imported content, including assets, is shared, so `content/assets/` is the permanent location.
