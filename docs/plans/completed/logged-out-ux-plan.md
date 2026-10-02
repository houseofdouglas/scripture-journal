# Execution Plan: Logged-out UX

**Started**: 2026-10-01
**Status**: DONE — all 4 tasks complete.
**Spec**: [docs/specs/auth.md](../../specs/auth.md) (FR-11a, FR-11b)
**Tasks**: [docs/tasks/logged-out-ux-tasks.md](../../tasks/logged-out-ux-tasks.md)

## Progress

- [x] LO-01 — Distinguish expired session from never signed in
- [x] LO-02 — No authenticated queries while signed out
- [x] LO-03 — Signed-out nav
- [x] LO-04 — Vitest + Playwright coverage

## Verification

`npm run lint -- --max-warnings 0`, `npm run typecheck`, `npm run test:run` (262 passed), `npx playwright test --project=chromium` (97 passed).
