# Project Brief: Scripture Journal (Study Journal)

**Core Problem**: Personal study reflections lose their meaning and context over time when stored separately from the source material — and source material itself disappears from the web, breaking the connection entirely.

**Value Proposition**: This tool helps a thoughtful reader capture and revisit personal reflections tied to specific passages by preserving source content inline alongside timestamped annotations, at the verse or paragraph level.

**Primary User**: A single authenticated user (Peter) conducting personal scripture study or research, wanting to annotate content and return to those annotations over time.

**Secondary Users**: Potentially other individuals with their own accounts in the future — architecture supports multi-user from day one via per-user data isolation.

**Known Constraints**:
- AWS hosted, lowest cost possible (serverless / pay-per-use only)
- Basic username/password auth — no IdP
- Plain-text extraction from source content only (no footnotes, hyperlinks, cross-references)
- Content font and annotation font must be visually distinct
- All source content stored in the app — no reliance on external URLs at read time
- Source content is not limited to LDS materials long-term; architecture must treat "pre-loaded structured content" and "URL-imported article content" as general content types

**Complexity Estimate**: Medium (6–10 week solo effort)

**Explicitly Out of Scope (Phase 1)**:
- Sharing annotations with other users
- Phase 2: cross-time view ("all entries for this chapter")
- Mobile native app
- IdP-backed auth (OAuth, Cognito, Google, etc.)
- Full-text search across annotations or content

## Key Capabilities

### Content Management
- Pre-loaded LDS Standard Works, browsable by book → chapter → verse
- URL-based article import (Conference Talks, magazine articles, and arbitrary future sources) — fetch, strip to plain text, store locally
- Content stored once per item, referenceable across many journal entries and users

### Inline Annotation
- Content rendered block-by-block (verse for scripture, paragraph for articles)
- Hover "+" icon on the left of each block opens an inline note editor anchored to that block
- Visual distinction via separate fonts for source content vs. user notes

### Journal Entries
- Entry = date + content piece + annotations made during that session
- Multiple entries may reference the same content piece on different days

### Auth
- Username/password with hashed passwords, session- or JWT-based

## Architecture (AWS, serverless, cost-optimized)

**Approach: pure content-addressed storage — no database.**

The app's data is naturally file-shaped (documents, entries, annotations) and its query shape is simple and known in advance. JSON files on S3 give zero-cost reads at the edge and trivial write paths, with no database tier to run.

**Storage layout (S3):**

```
s3://app/
├── content/
│   ├── scripture/<work>/<book>/<chapter>.json   # pre-loaded, immutable
│   └── articles/<sha256>.json                   # write-once on import
├── users/<userId>/
│   ├── profile.json                             # username, password hash
│   ├── entries/<entryId>.json                   # one journal entry
│   └── index.json                               # list of entries (for Phase 2)
└── auth/
    └── users-by-name.json                       # username → userId lookup
```

**Reads:** CloudFront → S3 directly. Scripture and articles are edge-cached globally; no compute on the read path.

**Writes:** small per-operation Lambda functions (`saveEntry`, `importArticle`, `signup`, `login`). Each write uses `PutObject` with `If-Match` ETag for optimistic concurrency. Per-user files are only written by that user, so contention is naturally avoided.

**Auth:** single Lambda validates password against `profile.json`, issues a signed JWT. Subsequent write Lambdas verify JWT.

**Frontend:** SPA (framework TBD in requirements phase) hosted on S3 + CloudFront.

**Cost profile at idle:** pennies/month (S3 storage only). Per-request: Lambda ms + S3 GET/PUT + CloudFront egress. Free-tier likely covers solo usage entirely.

**Trade-offs accepted:**
- Phase 2 queries require a per-user reverse index (`users/<userId>/by-content/<contentId>.json`) or client-side filter on `index.json` — acceptable at expected data volumes.
- Multi-file atomic writes are not native; operations that touch more than one file must be idempotent and re-runnable.
- Full-text search is not possible without adding an index tier (out of scope for Phase 1).
