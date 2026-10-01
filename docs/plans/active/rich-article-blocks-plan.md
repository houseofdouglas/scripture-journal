# Execution Plan: rich-article-blocks
Started: 2026-10-01
Status: IN PROGRESS

Branch: `feat/rich-article-blocks`. Tasks run in parallel waves (see the tasks file); each task is built in its own worktree branch `rab/<task>` and merged into the feature branch at the end of its wave.

## Progress
- [ ] RAB-01 — Test: fixtures and baseline article ids
- [x] RAB-02 — Types: block kinds and schemas
- [ ] RAB-03 — Service: content-root selection
- [ ] RAB-04 — Service: block walker, text and headings
- [ ] RAB-05 — Service: list extraction
- [ ] RAB-06 — Service: code-block extraction
- [ ] RAB-07 — Service: table extraction
- [ ] RAB-08 — Service: catch-all text and no-loss property
- [ ] RAB-09 — Service: image info reader
- [ ] RAB-10 — Service: SVG sanitizer
- [x] RAB-11 — Service: SSRF-safe image fetcher
- [ ] RAB-12 — Repository: asset store
- [ ] RAB-13 — Service: figure detection and resolution
- [ ] RAB-14 — Service: hashing and import integration
- [x] RAB-15 — Infra: IAM and CloudFront asset headers
- [ ] RAB-16 — UI: block renderers (headings, lists, tables)
- [ ] RAB-17 — UI: code block with Copy
- [ ] RAB-18 — UI: figure block
- [ ] RAB-19 — UI: "View original size" modal
- [ ] RAB-20 — UI: Past Entry excerpt prefixes
- [ ] RAB-21 — Test: E2E rich article view
- [ ] RAB-22 — Deploy and smoke-test the reference import

## Decisions & Notes
- 2026-10-01 — Spec FR-24 corrected during planning: Browse Articles search is title/URL only, so "search matches block text" was replaced with Past Entry excerpt prefixes.
- 2026-10-01 — ADR records an unresolved tension with the 2026-04-21 content-scope ADR (non-allowlisted sources stored as shared).
