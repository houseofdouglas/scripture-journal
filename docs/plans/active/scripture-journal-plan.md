# Execution Plan: Scripture Journal Phase 1

**Started**: 2026-04-22
**Status**: IN PROGRESS
**Tasks file**: [docs/tasks/scripture-journal-tasks.md](../../tasks/scripture-journal-tasks.md)

---

## Progress

### Phase 1 — Foundation
- [x] T01 — Infra: SSM JWT secret parameter *(30min)*
- [x] T02 — Infra: esbuild Lambda build pipeline *(1hr)*
- [x] T03 — Types: shared Zod schemas and TypeScript interfaces *(2hr)*
- [x] T04 — Config: environment config and SSM secret loader *(1hr)*
- [x] T05 — Repository: S3 client and conditional-write retry utility *(2hr)*

### Phase 2 — Auth
- [x] T06 — Repository: auth data access *(1hr)*
- [x] T07 — Service: auth business logic *(2hr)*
- [x] T08 — Handler: Hono app, JWT middleware, and auth routes *(2hr)*
- [x] T09 — Infra: Lambda function, IAM role, and Function URL *(1hr)*
- [x] T10 — UI: React Router, auth context, ProtectedRoute, app shell *(2hr)*
- [x] T11 — UI: Login screen *(1hr)*
- [x] T12 — UI: Change Password screen *(1hr)*

### Phase 3 — Scripture
- [x] T13 — Data: scripture ingestion script *(4hr)*
- [x] T14 — Repository: scripture S3 reads and TanStack Query hooks *(1hr)*
- [x] T15 — UI: Scripture Browser *(2hr)*
- [x] T16 — UI: Chapter View (content only) *(2hr)*

### Phase 4 — Article Import
- [x] T17 — Repository: article S3 reads and writes *(1hr)*
- [x] T18 — Service and Handler: POST /articles/import *(3hr)*
- [x] T19 — UI: Article Import Modal *(2hr)*
- [x] T20 — UI: Article View (content only) *(2hr)*

### Phase 5 — Annotation
- [x] T21 — Repository: JournalEntry and UserIndex conditional writes *(2hr)*
- [x] T22 — Service and Handler: POST /entries/annotate *(2hr)*
- [x] T23 — UI: Inline "+" editor and saved annotation display *(2hr)*

### Phase 6 — Dashboard
- [x] T24 — UI: Dashboard *(2hr)*
- [x] T25 — UI: Past Entry View *(1hr)*

### Phase 7 — Tests
- [x] T26 — Tests: auth service unit tests *(2hr)*
- [x] T27 — Tests: article import service unit tests *(2hr)*
- [x] T28 — Tests: annotation service and conditional-write unit tests *(2hr)*
- [x] T29 — Tests: handler integration tests *(2hr)*

---

## Decisions & Notes

*(Updated as work proceeds)*

- 2026-04-22 — Journal entry `date` is client-supplied local date (YYYY-MM-DD), not server UTC. Prevents late-night study sessions being attributed to the wrong day. See annotation spec.
- 2026-04-22 — T13 (scripture ingestion) and T01/T02 (infra) have no mutual dependencies — can proceed in parallel.
- 2026-04-22 — T23 (annotation editor) intentionally layered onto T16/T20 after content views are stable. Both content views built content-only first.
