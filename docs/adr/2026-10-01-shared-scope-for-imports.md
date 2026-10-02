# ADR: All Imported Content Is Shared

**Date**: 2026-10-01
**Status**: Accepted
**Supersedes (in part)**: [ADR 2026-04-21 content-scope](2026-04-21-content-scope-and-scripture-source.md) — the source allowlist that gated `scope=shared`

## Context

ADR 2026-04-21 introduced a two-scope model: content from allowlisted sources (only churchofjesuschrist.org) is `scope=shared` under `content/`, and everything else would be `scope=private` under `users/<userId>/content/`, with each new shared source requiring its own ADR.

In practice, arbitrary-URL and PDF import shipped with every article stored as shared, and [ADR 2026-10-01 rich-article-blocks](2026-10-01-rich-article-blocks.md) extended that to locally stored images under `content/assets/`. That ADR recorded the mismatch as an unresolved tension.

## Decision

All imported content — articles from any source, PDFs, and their images — is stored as `scope=shared` under `content/`. There is no source allowlist for sharing, and adding a source does not require an ADR.

The private-scope path (`users/<userId>/content/`) is no longer planned. The rest of ADR 2026-04-21 stands, including churchofjesuschrist.org as the scripture source and the non-commercial commitment.

## Rationale

- The app is a personal, non-commercial study tool whose users are all authenticated. Imported material is used for private study and annotation, not republished. Content is served only through the authenticated app's CloudFront distribution, from buckets with public access blocked.
- One shared, content-addressed copy matches how the system already works: deduplication by SHA-256, one URL index, and one article index. A per-user private copy would add storage, indexing, and UI complexity for no current benefit.

## Consequences

- **Matches current behaviour**: the code needs no changes. The "Known tension" section of ADR 2026-10-01 rich-article-blocks is resolved by this ADR.
- **Every user sees every import**: anything one user imports, including images, is visible to all users of the app. This is acceptable for the current single-owner deployment. Revisit it if the app gains users who should not see each other's imports.
- **The non-commercial commitment matters more**: shared third-party content, now including images, relies on personal, non-commercial use. A commercial pivot would require reviewing all shared content.
- **No private→shared migration is needed**: there is no private scope.
