# ADR: Content Scope Model and Scripture Source

**Date**: 2026-04-21
**Status**: Accepted

## Context

Two related decisions needed resolution before building content ingestion:

1. What is the source of scripture text for the four LDS Standard Works?
2. How does the app handle content with different copyright / ToU postures?

Research surfaced two viable scripture-source paths:

- **Public-domain path**: KJV Bible is fully PD; the Book of Mormon (1920 edition), D&C (1921 edition), and Pearl of Great Price (1921 edition) are PD on Wikisource/Archive.org with modern verse numbering. **Gap**: D&C sections 137, 138, and Official Declaration 2 (1976–1978) remain under copyright — no clean PD source exists.
- **churchofjesuschrist.org path**: Complete, current verse numbering. Their [Terms of Use](https://www.churchofjesuschrist.org/legal/terms-of-use) explicitly permit downloading and reproducing content for "personal, non-commercial use" without a separate license.

## Decision

### Content scope model

Introduce a two-scope content model:

- **scope=shared**: One canonical copy stored under `content/`, accessible to all authenticated users of the app. Permitted when the copyright holder's ToU allows personal, non-commercial use and the app itself is non-commercial.
- **scope=private**: Per-user copy stored under `users/<userId>/content/`, accessible only to the importing user. Required for content without such ToU coverage.

A hard-coded **source allowlist** gates which domains qualify for scope=shared. For Phase 1 the allowlist is:

- `churchofjesuschrist.org`

Additions to the allowlist require a new ADR documenting the ToU review for that source.

### Scripture source

Use **churchofjesuschrist.org** as the source for all four Standard Works. Ingestion is performed under their personal/non-commercial ToU; content is stored as scope=shared.

## Rationale

- **The app is non-commercial and will remain so.** This is a stated precondition (captured as NFR-50). It makes the personal-use ToU path defensible for all users of the app collectively, as long as commercial use is never introduced.
- **Single principled rule beats a patchwork.** Had we chosen the PD path for scripture, we would still have needed the scope model once arbitrary-URL imports land in Phase 2. Adopting it now means the architecture is future-proof and the scripture decision fits naturally into the same framework.
- **Completeness matters for scripture.** The PD route leaves D&C 137, 138, and OD-2 out — these are frequently referenced, and a visible gap would undermine the tool's utility. The ToU path is complete.
- **No legal tension for solo use.** Even for a multi-user future, as long as every user is an authenticated personal user of a non-commercial app, the "personal, non-commercial use" clause covers each of them individually; serving one canonical copy is an implementation detail that does not change their use posture.

## Storage layout (reflecting the scope model)

```
s3://{bucket}/
├── content/                                          # scope=shared
│   ├── scripture/<work>/<book>/<chapter>.json
│   ├── articles/<articleId>.json
│   └── articles/url-index/<sha256-of-url>.json
├── users/<userId>/
│   ├── profile.json
│   ├── entries/<entryId>.json
│   ├── index.json
│   └── content/                                      # scope=private (Phase 2+)
│       ├── articles/<articleId>.json
│       └── articles/url-index/<sha256-of-url>.json
└── auth/
    └── users-by-name.json
```

A JournalEntry's `contentRef` is the full S3 key of the referenced content file. The prefix encodes scope: `content/*` = shared; `users/<userId>/content/*` = private.

## Consequences

- **Phase 1 is single-scope.** Only churchofjesuschrist.org is on the allowlist; all Phase 1 content is scope=shared. The private path is designed in (storage layout, contentRef encoding, IAM rules) but no Phase 1 feature exercises it.
- **Phase 2 opens arbitrary-URL import.** Sources not on the allowlist default to scope=private. UI clearly labels private vs. shared content.
- **No private→shared migration.** One-way classification at import time (FR-99 WON'T). Re-classification would require manual out-of-band work.
- **Commitment to non-commercial.** If the project ever pivots commercial, scope=shared content sourced under personal-use ToU must be reviewed and may need replacement with truly PD sources or a commercial license.
- **Adding a new shared source is a deliberate act**, not an ergonomic shortcut — gated by an ADR with ToU analysis.
