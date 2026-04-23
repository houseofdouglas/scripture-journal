# Spec: Annotation

**Status**: APPROVED
**Created**: 2026-04-22
**Last Updated**: 2026-04-22 (patch: client-supplied local date)
**Related Specs**: auth, scripture-browsing, article-import, dashboard

---

## Overview

**Summary**: On any content page (chapter or article), the user hovers a block to reveal a "+" icon, clicks to open an inline note editor, and saves a plain-text annotation. All annotations for a (user, date, contentRef) tuple are grouped into a single journal entry. Entries are append-only.

**User Roles**: Reader

**Why**: Annotations are the core value of the app — they tie personal reflection to the exact verse or paragraph that prompted it, preserved at the specific content version in use at the time.

---

## User Stories

- As a **Reader**, I want to click "+" next to a verse or paragraph and type a note, so that I can record my thoughts tied to that specific block.
- As a **Reader**, I want my notes to appear inline after I save them, so that I can see my annotations in context as I continue reading.
- As a **Reader**, I want all notes from the same reading session grouped into a single journal entry, so that I can find a day's study in one place.

---

## Functional Requirements

1. On any content page (Chapter View or Article View), a "+" icon appears in the left gutter of a block on hover, within 100ms and without layout shift (NFR-41).
2. Clicking "+" opens an inline note editor anchored to that block. Only one editor is open at a time; opening a second "+" while an editor is open is blocked (user must Save or Cancel first).
3. The editor contains a plain-text `<textarea>` and two buttons: "Save Note" and "Cancel". Cancel closes the editor without saving and without confirmation.
4. Clicking "Save Note" submits `POST /entries/annotate`.
5. The server derives `userId` from the JWT `sub` claim — never from the request body.
6. The server computes `entryId = ${date}_${sha256(contentRef).slice(0, 16)}` where `date` is the client-supplied local date (see request body). This is deterministic and enables find-or-create without a prior read in the happy path.
7. The entry file at `users/<userId>/entries/<entryId>.json` is written with a conditional PUT:
   - If the file does not exist: `If-None-Match: *`
   - If the file exists: `If-Match: <current ETag>` — re-read to get the ETag first
   On 412 conflict, the Lambda re-reads the latest entry, appends the new annotation to the existing `annotations[]`, and retries with the fresh ETag. Max 3 retries with exponential backoff (100ms, 200ms, 400ms). On 4th failure, return 409 `WRITE_CONFLICT`.
8. The annotation stored is `{ blockId, text, createdAt }`. `blockId` is the verse `number` (1-indexed, scripture) or paragraph `index` (0-indexed, article). `createdAt` is server-assigned ISO 8601.
9. After writing the entry, the Lambda updates `users/<userId>/index.json` (UserIndex) using the same conditional write + retry pattern.
10. The SPA renders today's saved annotations inline below their respective blocks immediately after a successful 200 response. The editor closes.
11. Annotations from prior journal entries for the same content are **not** shown during today's session (FR-44).
12. Annotation text is never logged (NFR-14).
13. If `POST /entries/annotate` fails (network error, 5xx, 409), the SPA shows an inline error strip below the editor: "Could not save your note. Your text is preserved." with a Retry button. The textarea text is preserved. The editor remains open.
14. On 401 (expired token), the SPA stores the current textarea text in `sessionStorage` under the key `pendingNote`, redirects to `/login?return=<currentPath>`, and restores the text from `sessionStorage` into the editor on return.
15. Source content (verse/paragraph) is rendered in a serif font family. Annotation text and the note editor are rendered in a sans-serif font family (FR-45, NFR-40).

---

## Data Model

### `JournalEntry` — `users/<userId>/entries/<entryId>.json`

```typescript
interface JournalEntry {
  entryId: string;         // "${YYYY-MM-DD}_${sha256(contentRef).slice(0,16)}"
  userId: string;          // from JWT sub
  date: string;            // YYYY-MM-DD (server local date in UTC)
  contentRef: string;      // full S3 key, e.g. "content/scripture/book-of-mormon/alma/32.json"
  contentTitle: string;    // captured at first annotation; e.g. "Alma 32" or article title
  contentType: "scripture" | "article";
  annotations: Array<{
    blockId: number;       // verse number (1-indexed) or paragraph index (0-indexed)
    text: string;
    createdAt: string;     // ISO 8601, server-assigned
  }>;
  updatedAt: string;       // ISO 8601; updated on every append
}
```

### `UserIndex` — `users/<userId>/index.json`

```typescript
interface UserIndex {
  entries: Array<{
    entryId: string;
    date: string;           // YYYY-MM-DD
    contentRef: string;
    contentTitle: string;
    contentType: "scripture" | "article";
    snippet: string;        // text of the first annotation, truncated to 200 chars
    noteCount: number;      // total annotations in this entry
  }>;                       // ordered newest-first
}
```

The `UserIndex` is updated on every successful annotation save. If the entry already exists in the index, its `snippet` (only if this is the first annotation) and `noteCount` are updated.

---

## API Contract

### `POST /entries/annotate`

**Auth required**: Yes (`Authorization: Bearer <token>`)

**Request body**:
```typescript
{
  date: string;                // client's local date, YYYY-MM-DD (e.g. "2026-04-22")
  contentRef: string;          // full S3 key — validated against known prefixes
  contentTitle: string;        // provided by client from the loaded content
  contentType: "scripture" | "article";
  blockId: number;             // integer ≥ 0
  text: string;                // min 1 non-whitespace character
}
```

Zod constraint on `date`: `z.string().regex(/^\d{4}-\d{2}-\d{2}$/)`. The server trusts the client's date; it is a personal single-user tool with no cross-user trust concerns.

**200 OK**:
```typescript
{
  entryId: string;
  annotation: {
    blockId: number;
    text: string;
    createdAt: string;         // ISO 8601
  };
  noteCount: number;           // total annotations on this entry after save
}
```

**409 Conflict** (all retries exhausted):
```typescript
{ error: "WRITE_CONFLICT"; message: "Could not save your note. Please try again." }
```

**422 Unprocessable Entity**:
```typescript
{ error: "VALIDATION_ERROR"; message: string; fields: Record<string, string> }
```

---

## Error States & Edge Cases

| Scenario | Behaviour |
|----------|-----------|
| Two browser tabs annotating the same entry simultaneously | Lambda re-reads and merges on 412; both annotations saved. On 4th 412, returns 409. |
| Empty or whitespace-only note text | SPA blocks submit; server also rejects with 422 |
| Network offline during save | SPA shows inline error with Retry; text preserved in textarea |
| 401 during save (expired token) | Note text stored in `sessionStorage["pendingNote"]`; redirect to login; restored on return |
| Entry write succeeds but UserIndex update fails (412 × 3) | Entry annotation is durable. UserIndex failure is logged. Dashboard may be temporarily stale (entry is still accessible by direct URL). |
| `contentRef` points to a path the user should not access (e.g., another user's private content) | 422 `VALIDATION_ERROR` — `contentRef` must match `content/*` (shared) only in Phase 1 |

---

## Acceptance Criteria

### Happy Path

- [ ] Hovering a verse or paragraph reveals "+" within 100ms with no layout shift.
- [ ] Clicking "+" opens the inline editor; clicking Cancel closes it without saving.
- [ ] Typing a note and clicking "Save Note" calls `POST /entries/annotate`; the saved note appears inline below the block within 1s at p95.
- [ ] A second "Save Note" on the same block appends a new annotation below the first.
- [ ] All annotations saved in one session share the same `entryId` (same user + date + contentRef).
- [ ] Returning to the same content on a different calendar date creates a new entry (different `date` → different `entryId`).
- [ ] Source text renders in a serif font; annotation text and the editor render in a sans-serif font.

### Error Handling

- [ ] On 5xx, the inline error strip appears with "Could not save your note. Your text is preserved." and a Retry button; textarea text is intact.
- [ ] On 401, `sessionStorage["pendingNote"]` contains the note text; after re-login the user is returned to the content page and the text is restored in the editor.
- [ ] Retrying after a 5xx saves the note successfully when the server recovers.
- [ ] On 409 (all retries exhausted), the SPA shows the error strip — the user can retry manually.

### Security

- [ ] Unauthenticated `POST /entries/annotate` returns 401.
- [ ] `userId` is derived from JWT `sub` — the request body contains no userId field.
- [ ] Annotation text does not appear in CloudWatch logs.
- [ ] `contentRef` with a `users/<otherId>/` prefix returns 422.

### Edge Cases

- [ ] Two simultaneous saves from different tabs both appear in the entry (merge on 412 retry succeeds).
- [ ] Only today's annotations are shown inline; prior-day annotations on the same content are not rendered.
- [ ] Clicking "+" while an editor is already open on another block does nothing (the open editor must be resolved first).

---

## Non-Functional Requirements

- **Performance**: Annotation save completes within 1s at p95 (NFR-02).
- **Availability**: S3 conditional write retried up to 3 times with exponential backoff on 412 (NFR-20).
- **Security**: `text` field never appears in CloudWatch logs (NFR-14).

---

## Out of Scope

- Editing or deleting annotations after save (FR-90 — append-only by design)
- Sharing annotations between users (FR-91)
- Cross-session view of all annotations on a content piece (FR-92 — Phase 2)
- Annotations on private-scope content (Phase 2+)

---

## Open Questions

| Question | Owner | Resolution |
|----------|-------|------------|
| Server date for `entryId` — UTC or user's local date? | Peter | **Resolved**: client sends local date (`YYYY-MM-DD`) in the request body. Server uses it directly for `entryId` and `entry.date`. No TZ stored; no server-side conversion. `createdAt`, `updatedAt`, and `importedAt` remain UTC ISO 8601 for ordering precision. |
