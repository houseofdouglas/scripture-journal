# Spec: Dashboard

**Status**: APPROVED
**Created**: 2026-04-22
**Last Updated**: 2026-04-22
**Related Specs**: annotation, auth

---

## Overview

**Summary**: The authenticated home screen displays a reverse-chronological journal entry list, a calendar marking days with entries, and a read-only past-entry view that renders content pinned to the exact version in use when the entry was created.

**User Roles**: Reader

**Why**: The dashboard is the user's window into their study history — letting them see what they've done and easily revisit any past session with annotations shown in context.

---

## User Stories

- As a **Reader**, I want to see a list of my past journal entries in reverse-chronological order, so that I can track my study history at a glance.
- As a **Reader**, I want to click a past entry and read the content alongside my annotations from that day, so that I can revisit my study in context.
- As a **Reader**, I want a calendar that marks days I studied, so that I can see my consistency and jump to a specific date.
- As a **Reader**, I want to see an encouraging empty state when I have no entries yet, so that I know what to do next.

---

## Functional Requirements

1. The dashboard reads `users/<userId>/index.json` (UserIndex) from CloudFront. No Lambda is involved in rendering the dashboard.
2. The entry list is rendered from `UserIndex.entries` (newest-first order).
3. **Single-entry days**: a full card showing date, content type badge (`SCRIPTURE` or `ARTICLE`), content title, snippet (first annotation text, up to 200 chars), and note count.
4. **Multi-entry days (≥ 2 entries)**: a grouped date header ("April 22, 2026 · 3 entries") followed by one compact row per entry showing content type badge, content title, and note count — no snippet text.
5. Clicking any entry card or compact row navigates to `/entries/<entryId>`.
6. The calendar (FR-70) renders the current month. Days with ≥ 1 entry are visually marked (dot or highlight). Clicking a marked day scrolls to or filters the entry list to show that date's entries; clicking elsewhere on the calendar or the same day again clears the filter.
7. A loading skeleton is shown while `index.json` fetches from CloudFront.
8. A first-time user whose UserIndex has zero entries sees: no calendar marks, no entry cards, and an empty-state message — "Your journal is empty. Start by reading a scripture chapter or importing an article." — with two CTA buttons: "Browse Scripture" and "Import Article".
9. **Past Entry View** (`/entries/<entryId>`):
   - The SPA fetches `users/<userId>/entries/<entryId>.json` then fetches the content file at `entry.contentRef` — both from CloudFront.
   - Content is rendered read-only: no "+" icons, no inline editor.
   - That entry's `annotations[]` are rendered inline below their respective blocks using the same visual style as a live session (serif content, sans-serif notes) but with a muted/desaturated palette and a lighter left border.
   - A "Past Entry" banner at the top of the content area states the session date.
   - A "Study Today →" button (in the banner and at the bottom of the content) navigates to the live content page (`/scripture/…` or `/articles/<articleId>`), starting a fresh today's session.
10. The back link in the Past Entry View reads "← Dashboard" when entered from the entry list, or "← April 22, 2026" when entered from a calendar day selection.

---

## Data Model

Reads from `UserIndex` (defined in the annotation spec). No writes from the dashboard or past entry view.

Past Entry View additionally reads:
- `users/<userId>/entries/<entryId>.json` — the `JournalEntry`
- The content file at `entry.contentRef` — `ScriptureChapter` or `Article`

All reads are CloudFront-cached S3 GETs. No Lambda involved.

---

## Error States & Edge Cases

| Scenario | Behaviour |
|----------|-----------|
| `index.json` fetch fails | Dashboard shows error banner with Retry; skeleton remains |
| `index.json` is empty (`entries: []`) | Empty-state UI with two CTA buttons |
| Past entry content file missing (unlikely — content is immutable) | Error: "Content not found" with link back to Dashboard |
| Past entry `entryId` not found | 404-style message: "Entry not found" with link to Dashboard |
| Calendar current month has no entries | Calendar renders with no marked days; entry list shows all entries unfiltered |
| Entry has `contentType: "article"` with `previousVersionId` set | Article View shows "Version N" badge; Past Entry View shows the same badge |

---

## Acceptance Criteria

### Happy Path

- [ ] Dashboard renders within 500ms at p95 (UserIndex from CloudFront cache).
- [ ] A day with one entry shows a full card with snippet text.
- [ ] A day with two or more entries shows a grouped date header and compact rows with no snippet.
- [ ] Content type badge (`SCRIPTURE` / `ARTICLE`) appears on all cards and rows.
- [ ] Clicking an entry card navigates to `/entries/<entryId>`.
- [ ] Past Entry View renders content at the exact `contentRef` version stored in the entry.
- [ ] That entry's annotations are shown inline; no "+" icons are present.
- [ ] The "Past Entry" banner states the session date.
- [ ] "Study Today →" navigates to the live content page.
- [ ] Calendar marks the correct days; clicking a marked day filters the entry list to that date.

### Empty State

- [ ] A user with no entries sees the empty-state message and two CTA buttons.
- [ ] After saving a first annotation (creating a first entry), the empty state disappears and the entry card appears on the next dashboard load.

### Loading & Error

- [ ] Loading skeleton is shown while `index.json` fetches.
- [ ] `index.json` fetch failure shows a retry prompt.

### Security

- [ ] Dashboard only renders entries for the authenticated user (`userId` from JWT `sub`).
- [ ] Navigating to `/entries/<entryId>` belonging to a different user returns a 404-style error (the S3 key includes `userId` — CloudFront serves a 404 for a non-existent key).

### Edge Cases

- [ ] Past entry for an article with `previousVersionId` shows the "Version N" badge on the article header.
- [ ] Clicking a calendar day with multiple entries shows all entries for that day as a filtered list.

---

## Non-Functional Requirements

- **Performance**: Dashboard first meaningful render ≤ 500ms from CloudFront edge cache (NFR-01).
- **Cost**: Zero Lambda invocations for dashboard and past entry reads — all S3 via CloudFront.
- **Availability**: CloudFront serves stale cached UserIndex if S3 is temporarily unavailable (standard CDN behaviour).

---

## Out of Scope

- Cross-time view of all annotations on a single content piece (FR-92 — Phase 2)
- Full-text search across annotations or content (FR-93)
- Exporting journal data (FR-94)
- Tagging or categorising entries
- Pagination of the entry list (Phase 1: render all entries; revisit if count grows large)

---

## Open Questions

| Question | Owner | Resolution |
|----------|-------|------------|
| Calendar navigation — does the user need to browse past months, or is current month only sufficient? | Peter | Current month only for Phase 1; past months reachable via the entry list scroll. |
