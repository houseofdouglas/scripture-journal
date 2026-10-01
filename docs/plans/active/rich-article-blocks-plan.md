# Execution Plan: rich-article-blocks
Started: 2026-10-01
Status: IN PROGRESS

Branch: `feat/rich-article-blocks`. Tasks run in parallel waves (see the tasks file); each task is built in its own worktree branch `rab/<task>` and merged into the feature branch at the end of its wave.

## Progress
- [x] RAB-01 — Test: fixtures and baseline article ids
- [x] RAB-02 — Types: block kinds and schemas
- [x] RAB-03 — Service: content-root selection
- [x] RAB-04 — Service: block walker, text and headings
- [x] RAB-05 — Service: list extraction
- [x] RAB-06 — Service: code-block extraction
- [x] RAB-07 — Service: table extraction
- [x] RAB-08 — Service: catch-all text and no-loss property
- [x] RAB-09 — Service: image info reader
- [x] RAB-10 — Service: SVG sanitizer
- [x] RAB-11 — Service: SSRF-safe image fetcher
- [x] RAB-12 — Repository: asset store
- [x] RAB-13 — Service: figure detection and resolution
- [ ] RAB-14 — Service: hashing and import integration
- [x] RAB-15 — Infra: IAM and CloudFront asset headers
- [x] RAB-16 — UI: block renderers (headings, lists, tables)
- [x] RAB-17 — UI: code block with Copy
- [x] RAB-18 — UI: figure block
- [x] RAB-19 — UI: "View original size" modal
- [x] RAB-20 — UI: Past Entry excerpt prefixes
- [x] RAB-21 — Test: E2E rich article view
- [ ] RAB-22 — Deploy and smoke-test the reference import

## Decisions & Notes
- 2026-10-01 — Spec FR-24 corrected during planning: Browse Articles search is title/URL only, so "search matches block text" was replaced with Past Entry excerpt prefixes.
- 2026-10-01 — ADR records an unresolved tension with the 2026-04-21 content-scope ADR (non-allowlisted sources stored as shared).
- 2026-10-01 — RAB-01 verified fixture counts: 10 h2 (not 11 — 3 more h2 sit outside the body), 2 `.sd-key` callouts (not 5). Spec/tasks/ADR corrected. Callout icons have only a viewBox, so decorative-size detection must read viewBox. Baseline ids in `src/service/__tests__/fixtures/baseline-ids.json`.
- 2026-10-01 — S3 409 ConditionalRequestConflict on asset write is surfaced as an error (not success); RAB-13 should turn it into an unavailable figure.
- Lint: repo has no ESLint config; agents run typecheck + tests only. Separate task suggested.
- 2026-10-01 — UI block components use PascalCase under `src/ui/components/blocks/` (matches existing component convention), with `BlockContent.tsx` dispatching by kind.
- 2026-10-01 — RAB-10 sanitizer has private viewBox/length helpers duplicating RAB-09 `readSvgDimensions`; they differ when only one of width/height is absolute (sanitizer overwrites both from viewBox; reader derives the missing side from the viewBox ratio). RAB-13 must dedupe onto `readSvgDimensions` and write the sanitizer's width/height from it so stored attrs and stored figure dims agree.
- 2026-10-01 — Sanitizer residual risks (accepted, mitigated by `<img>` rendering + CSP): pattern-based CSS cleaning (rejects any backslash), HTML-mode parsing (XML-only DTD features lost), no internal complexity cap (relies on 2 MB fetch cap), benign animations kept.
- 2026-10-01 — RAB-07 dropped `<table><caption>` text; RAB-08 fixes this (table handler emits the caption as a text block before the table) so the no-loss property holds.
- 2026-10-01 — RAB-13: figure hashing for FR-15 derives from the asset key (`figureAssetSha(figure)`), no side map. A `<figure>` without media is not matched (inner tables/pre stay structured). `blocks.ts` now transitively loads the S3 client via `figure.ts` → `repository/asset` (needs env at import; fine in Lambda/tests).
- 2026-10-01 — RAB-08: no-loss property compares whitespace-stripped character streams (extraction joins adjacent inline text like textContent). Known limitation: inline elements styled block-level only via CSS glue to the next word (reference `sd-vs`: `<small>Traditional</small>An idea…` → "TraditionalAn idea…"). Follow-up decision for the user.
