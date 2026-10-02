# Tasks: Logged-out UX (session-expired banner + signed-out nav)

**Spec**: [docs/specs/auth.md](../specs/auth.md) — FR-11a, FR-11b
**Created**: 2026-10-01
**Status**: DONE

Production (fresh browser, no `localStorage`): visiting `/` landed on `/login?return=%2F` with "Your session has expired", and the nav showed app links while signed out.

**Root cause**: `LoginPage` showed the banner whenever `?return=` was present, and `ProtectedRoute` always adds `?return=`. The `GET /api/projects → 401` was a separate issue — Nav called `useProjects()` unconditionally; that hook used a raw `fetch` that swallowed the 401, so it was noise rather than the redirect source.

---

## Task: LO-01 — Distinguish expired session from never signed in

**Layer**: UI
**Status**: DONE

- `auth-context`: `readStoredSession()` (pure — StrictMode double-invokes initializers) reports `sessionExpired` when a stored token is past `jwt_expires_at` or incomplete; storage is cleared in an effect. Exposes `sessionExpired`, `loginUrl()`, `clearStoredSession()`.
- `ProtectedRoute`: redirects with `expired=1` only when `sessionExpired`.
- `LoginPage`: banner keyed on `expired=1`, not `return`.
- `api-client`: session-401 handling only when a token was sent; clears all session keys; redirects with `expired=1`. Token-less 401 → `ApiError`.

## Task: LO-02 — No authenticated queries while signed out

**Layer**: UI
**Status**: DONE

- `useProjects`: `enabled: Boolean(user)`, key `["projects", userId]`, fetches via `apiClient` (the 401-swallowing raw fetch is gone).

## Task: LO-03 — Signed-out nav

**Layer**: UI
**Status**: DONE

- `Nav`: centre links, mobile toggle and mobile panel render only with a user. Brand link stays.

## Task: LO-04 — Tests

**Status**: DONE

- Vitest: `Nav.test.tsx`, `ProtectedRoute.test.tsx` (StrictMode, with `LoginPage`), `api-client.test.ts`.
- Playwright: `e2e/auth.spec.ts` — signed-out landing (no banner, no app links, no `/api/*`), `?return=` vs `?expired=1`, token-bearing 401, expired stored JWT.
