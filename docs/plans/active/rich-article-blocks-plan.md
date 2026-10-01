# Execution Plan: rich-article-blocks
Started: 2026-10-01
Status: IN PROGRESS

Branch: `feat/rich-article-blocks`. Tasks run in parallel waves (see the tasks file); each task is built in its own worktree branch `rab/<task>` and merged into the feature branch at the end of its wave.

## Progress
- [x] RAB-01 — Test: fixtures and baseline article ids
- [x] RAB-02 — Types: block kinds and schemas
- [x] RAB-03 — Service: content-root selection
- [x] RAB-04 — Service: block walker, text and headings
- [ ] RAB-05 — Service: list extraction
- [ ] RAB-06 — Service: code-block extraction
- [ ] RAB-07 — Service: table extraction
- [ ] RAB-08 — Service: catch-all text and no-loss property
- [x] RAB-09 — Service: image info reader
- [x] RAB-10 — Service: SVG sanitizer
- [x] RAB-11 — Service: SSRF-safe image fetcher
- [x] RAB-12 — Repository: asset store
- [ ] RAB-13 — Service: figure detection and resolution
- [ ] RAB-14 — Service: hashing and import integration
- [x] RAB-15 — Infra: IAM and CloudFront asset headers
- [x] RAB-16 — UI: block renderers (headings, lists, tables)
- [x] RAB-17 — UI: code block with Copy
- [x] RAB-18 — UI: figure block
- [x] RAB-19 — UI: "View original size" modal
- [x] RAB-20 — UI: Past Entry excerpt prefixes
- [ ] RAB-21 — Test: E2E rich article view
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
