# Spec: Article Import

**Status**: APPROVED
**Created**: 2026-04-22
**Last Updated**: 2026-04-22
**Related Specs**: auth, annotation

---

## Overview

**Summary**: A user pastes a `churchofjesuschrist.org` URL into an import modal; the server fetches it, strips HTML to plain-text paragraphs, content-addresses it by SHA-256, detects duplicates and version changes, and stores the result in S3 as a shared article.

**User Roles**: Reader

**Why**: Articles from authorised sources are the secondary content type. Storing a local copy prevents link rot and enables block-level annotation of individual paragraphs.

---

## User Stories

- As a **Reader**, I want to import an article by pasting its URL, so that I can annotate it without worrying about the original link breaking.
- As a **Reader**, I want to be warned if I try to import an article I've already imported, so that I don't create unnecessary duplicates.
- As a **Reader**, I want the app to detect when an article has been updated since I last imported it and let me create a new version, so that I can study the current text while my old annotations remain on the prior version.
- As a **Reader**, I want to paste article text manually if the URL fetch fails, so that I am never blocked from importing content.

---

## Functional Requirements

1. `POST /articles/import` accepts `{ url: string }` (URL fetch mode) or `{ url: string; text: string; title: string }` (manual paste mode).
2. Before fetching, the server validates the URL host against the allowlist (`churchofjesuschrist.org`). Non-allowlisted domains return 422 `DOMAIN_NOT_ALLOWED` immediately — no outbound fetch is attempted.
3. The server fetches the URL with header `User-Agent: ScriptureJournal/1.0` and a 10-second timeout. On timeout or non-2xx response, it returns 422 `FETCH_FAILED`. No article is stored.
4. HTML is stripped to plain text by extracting the text content of `<p>` elements in document order, trimming leading/trailing whitespace per paragraph, and discarding empty paragraphs.
5. Article title is derived in priority order: `<meta property="og:title">` → `<title>` → `<h1>` → first 60 characters of the first paragraph + "…".
6. `articleId = SHA-256(plainText)` encoded as lowercase hex (64 characters).
7. **Duplicate detection**: if `content/articles/<articleId>.json` already exists, the server returns 200 `DUPLICATE` with `{ articleId, title, importedAt }`. No write occurs. The client navigates to the existing article.
8. **Version detection**: the server reads `content/articles/url-index/<sha256(url)>.json`. If the URL is known and the latest `articleId` in the index differs from the newly computed hash, this is a new version. The server returns 200 `NEW_VERSION` with `{ previousArticleId, previousImportedAt, title }`. The client must confirm before the server commits.
9. `POST /articles/import` with `{ url, confirm: true }` (sent after the user confirms the new version dialog) writes the article and updates the URL index.
10. New articles are stored at `content/articles/<articleId>.json` with `scope: "shared"`.
11. When a new version is stored, the article record includes `previousVersionId: <prior articleId>`.
12. The URL index at `content/articles/url-index/<sha256(url)>.json` is updated with `If-Match` ETag; on 412 conflict, re-read, merge `versions[]`, retry (max 3 times).
13. **Manual paste mode**: `{ url, text, title }` skips the fetch step. `text` is split on double-newline (`\n\n`) into paragraphs, trimmed, empty paragraphs discarded. The same SHA-256 / duplicate / version logic applies. The `url` is stored in article metadata as the recorded source, even though it was never successfully fetched.

---

## Data Model

### `Article` — `content/articles/<articleId>.json`

```typescript
interface Article {
  articleId: string;            // SHA-256(plainText) lowercase hex
  sourceUrl: string;            // original URL as provided by the user
  title: string;                // derived from HTML or provided manually
  importedAt: string;           // ISO 8601
  scope: "shared";              // Phase 1: always shared
  paragraphs: Array<{
    index: number;              // 0-indexed; used as blockId
    text: string;
  }>;
  previousVersionId?: string;   // articleId of the prior version if this is a new version
}
```

### `ArticleUrlIndex` — `content/articles/url-index/<sha256(url)>.json`

```typescript
interface ArticleUrlIndex {
  sourceUrl: string;
  versions: Array<{
    articleId: string;
    importedAt: string;         // ISO 8601
  }>;                           // ordered oldest → newest; last entry = current version
}
```

### Content Reference Encoding

`contentRef` for an article entry: `content/articles/<articleId>.json`

---

## API Contract

### `POST /articles/import`

**Auth required**: Yes (`Authorization: Bearer <token>`)

**Request body — URL fetch mode**:
```typescript
{
  url: string;        // must be a valid HTTPS URL on the allowlist
  confirm?: boolean;  // true when user confirms a NEW_VERSION
}
```

**Request body — Manual paste mode**:
```typescript
{
  url: string;        // recorded as source; need not be fetchable
  text: string;       // plain text; min 1 non-whitespace character
  title: string;      // min 1 character
  confirm?: boolean;
}
```

**200 OK — New article stored**:
```typescript
{ status: "IMPORTED"; articleId: string; title: string; paragraphCount: number }
```

**200 OK — Duplicate (no write)**:
```typescript
{ status: "DUPLICATE"; articleId: string; title: string; importedAt: string }
```

**200 OK — New version detected (awaiting confirm)**:
```typescript
{
  status: "NEW_VERSION";
  previousArticleId: string;
  previousImportedAt: string;
  title: string;
}
```

**200 OK — New version confirmed and stored**:
```typescript
{
  status: "VERSION_IMPORTED";
  articleId: string;
  title: string;
  previousVersionId: string;
  paragraphCount: number;
}
```

**422 — Domain not on allowlist**:
```typescript
{ error: "DOMAIN_NOT_ALLOWED"; message: "Only articles from churchofjesuschrist.org are supported." }
```

**422 — Fetch failed**:
```typescript
{ error: "FETCH_FAILED"; message: "Could not retrieve the article. Check the URL or paste the text manually." }
```

**422 — Validation error**:
```typescript
{ error: "VALIDATION_ERROR"; message: string; fields: Record<string, string> }
```

---

## Error States & Edge Cases

| Scenario | Behaviour |
|----------|-----------|
| URL host not on allowlist | 422 `DOMAIN_NOT_ALLOWED` before any fetch |
| Fetch timeout (> 10s) | 422 `FETCH_FAILED`; no write |
| Non-2xx HTTP response from source | 422 `FETCH_FAILED`; no write |
| Fetched HTML has no `<p>` content | 422 `FETCH_FAILED` — "No article content found at that URL" |
| Same URL, same content (re-import) | 200 `DUPLICATE`; client navigates to existing article |
| Same URL, different content (updated article) | 200 `NEW_VERSION`; client confirms before write |
| Different URLs, identical plain text | 200 `DUPLICATE` on second import — content-addressed |
| Manual paste with empty `text` | 422 `VALIDATION_ERROR` with `fields.text` |
| Manual paste with empty `title` | 422 `VALIDATION_ERROR` with `fields.title` |
| URL index 412 on 4th retry | 500 — article written but index update failed; logged as data inconsistency |
| `confirm: true` sent without a prior `NEW_VERSION` response (stale client) | 422 `VALIDATION_ERROR` — re-run import flow |

---

## Acceptance Criteria

### Happy Path

- [ ] Importing a valid `churchofjesuschrist.org` URL stores the article and returns `{ status: "IMPORTED", articleId }`; the SPA navigates to `/articles/<articleId>`.
- [ ] The stored article has `paragraphs` split at `<p>` boundaries, trimmed, empty entries discarded.
- [ ] `og:title` is used as the article title when present.
- [ ] Re-importing the same URL with unchanged content returns `{ status: "DUPLICATE" }` with the original `importedAt` date; no new S3 file is written.
- [ ] Re-importing the same URL with changed content returns `{ status: "NEW_VERSION" }`; after the client sends `confirm: true`, a new article is stored with `previousVersionId` set to the prior `articleId`.
- [ ] The URL index `versions[]` gains a new entry on each distinct version import.
- [ ] Manual paste with valid `{ url, text, title }` stores an article with paragraphs split on `\n\n`.

### Error Handling

- [ ] Non-allowlisted URL returns 422 `DOMAIN_NOT_ALLOWED` without making any outbound HTTP request.
- [ ] Fetch timeout returns 422 `FETCH_FAILED`; no article is written.
- [ ] Empty `text` in manual paste returns 422 with `fields.text` populated.
- [ ] Client displays "Paste article text manually instead →" link when `FETCH_FAILED` is received.

### Security

- [ ] Unauthenticated `POST /articles/import` returns 401.
- [ ] User-supplied URL is validated as a proper HTTPS URL by Zod before any fetch (`z.string().url()`).
- [ ] Server-side allowlist check cannot be bypassed by URL encoding or subdomain tricks (validate `hostname` property after URL parsing, not raw string match).

### Edge Cases

- [ ] Two users importing the same URL simultaneously both receive the same `articleId` (content-addressed); only one S3 write wins — the second is a no-op due to `If-None-Match: *` or equivalent.
- [ ] Manual paste of text identical to an already-imported article returns `DUPLICATE`.

---

## Non-Functional Requirements

- **Performance**: Import endpoint (fetch + strip + hash + write) completes within 15s at p95 (10s fetch timeout + 5s processing/write budget).
- **Timeout**: URL fetch aborted after exactly 10 seconds (NFR-21).
- **Cost**: One Lambda invocation per import; S3 writes are small (< 50 KB typical article). Acceptable within $1/month budget.

---

## Out of Scope

- Importing from sources other than `churchofjesuschrist.org` (FR-98 — Phase 2 with private-scope support)
- Private-scope article import (Phase 2+)
- Private → shared scope migration (FR-99)
- Re-importing to update title without content change

---

## Open Questions

| Question | Owner | Resolution |
|----------|-------|------------|
| Article title derivation priority when multiple meta sources are present | Peter | Resolved: `og:title` → `<title>` → `<h1>` → first-paragraph truncation (see FR-5 above) |
