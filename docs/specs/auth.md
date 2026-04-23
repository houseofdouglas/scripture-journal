# Spec: Auth

**Status**: APPROVED
**Created**: 2026-04-22
**Last Updated**: 2026-04-22
**Related Specs**: annotation, dashboard

---

## Overview

**Summary**: Custom username/password authentication backed by bcrypt password hashes, HS256-signed JWTs (24h TTL), and an admin-only user creation endpoint. No self-registration; no email reset.

**User Roles**: Reader (authenticates, changes own password), Admin (creates accounts via CLI/endpoint)

**Why**: The app is authenticated-only. Every write operation requires a valid JWT. There is no IdP in Phase 1 to keep infrastructure cost near zero and avoid external auth dependencies.

---

## User Stories

- As a **Reader**, I want to sign in with my username and password, so that I can access my journal.
- As a **Reader**, I want my session to persist for 24 hours without re-entering credentials, so I don't have to log in every visit.
- As a **Reader**, I want to change my own password, so that I can rotate credentials without admin involvement.
- As an **Admin**, I want to create a new user account via CLI or direct HTTP, so that I can provision access out-of-band.

---

## Functional Requirements

1. `POST /auth/login` accepts `{ username, password }` (case-insensitive username) and returns a signed JWT on success.
2. The JWT payload contains `{ sub: userId, username, iat, exp }` where `exp = iat + 86400`.
3. The JWT is signed with HS256 using a secret fetched from SSM Parameter Store at Lambda cold start and cached in instance memory.
4. On login, the system reads `auth/users-by-name.json` to resolve `username → userId`, then reads `users/<userId>/profile.json` to retrieve the bcrypt hash.
5. bcrypt comparison uses the stored hash (cost factor ≥ 12). On mismatch, the endpoint returns 401 with a generic message that does not distinguish wrong username from wrong password.
6. `POST /auth/login` is rate-limited per IP. Exceeding the limit returns 429 with a wait instruction.
7. `POST /auth/password` (JWT required) accepts `{ currentPassword, newPassword }`, re-verifies `currentPassword` server-side, then writes an updated `passwordHash` to `users/<userId>/profile.json`. The existing JWT remains valid after the change.
8. `POST /admin/users` (admin JWT required) accepts `{ username, password }`, validates uniqueness against `auth/users-by-name.json`, creates `users/<userId>/profile.json` and `users/<userId>/index.json` (empty), and updates `auth/users-by-name.json` via read-modify-write with 412 retry.
9. Usernames are normalized to lowercase before storage and lookup.
10. Logout is client-side only: the SPA clears the JWT from `localStorage`. No server-side token invalidation.
11. Any write endpoint receiving an expired or invalid JWT returns 401. The SPA clears `localStorage`, preserves the current URL as `?return=`, and redirects to `/login`.

---

## Data Model

### `UserProfile` — `users/<userId>/profile.json`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `userId` | `string` | Yes | UUIDv4, generated at creation |
| `username` | `string` | Yes | Lowercase-normalized, unique |
| `passwordHash` | `string` | Yes | bcrypt, cost ≥ 12 |
| `createdAt` | `string` | Yes | ISO 8601 |

### `UsersByName` — `auth/users-by-name.json`

```typescript
{ [lowercaseUsername: string]: string } // value = userId
```

Written with `If-Match` ETag. On 412 conflict, re-read, merge, retry (max 3 times).

### JWT Payload

```typescript
interface JwtPayload {
  sub: string;       // userId
  username: string;  // lowercase
  iat: number;       // epoch seconds
  exp: number;       // iat + 86400
}
```

### SSM Parameter

Path: `/scripture-journal/<env>/jwt-secret` (SecureString). Fetched once on Lambda cold start, held in module-level variable for instance lifetime.

---

## API Contract

### `POST /auth/login`

**Auth required**: No

**Request body**:
```typescript
{ username: string; password: string }
```

**200 OK**:
```typescript
{ token: string; expiresAt: string } // expiresAt = ISO 8601
```

**401 Unauthorized**:
```typescript
{ error: "INVALID_CREDENTIALS"; message: "Invalid username or password" }
```

**422 Unprocessable Entity** (Zod validation):
```typescript
{ error: "VALIDATION_ERROR"; message: string; fields: Record<string, string> }
```

**429 Too Many Requests**:
```typescript
{ error: "RATE_LIMITED"; message: "Too many sign-in attempts. Please wait before trying again." }
```

---

### `POST /auth/password`

**Auth required**: Yes (`Authorization: Bearer <token>`)

**Request body**:
```typescript
{ currentPassword: string; newPassword: string }
```

Zod constraints: both required, `newPassword` min 8 chars, `newPassword !== currentPassword` (also validated server-side).

**200 OK**:
```typescript
{ message: "Password updated" }
```

**401 Unauthorized** (wrong current password):
```typescript
{ error: "WRONG_CURRENT_PASSWORD"; message: "Current password is incorrect" }
```

**422 Unprocessable Entity**:
```typescript
{ error: "VALIDATION_ERROR"; message: string; fields: Record<string, string> }
```

---

### `POST /admin/users`

**Auth required**: Yes — JWT `username` must match the configured admin username (Phase 1: env var `ADMIN_USERNAME`, default `"peter"`)

**Request body**:
```typescript
{ username: string; password: string }
```

**201 Created**:
```typescript
{ userId: string }
```

**409 Conflict**:
```typescript
{ error: "USERNAME_TAKEN"; message: "Username already exists" }
```

---

## Error States & Edge Cases

| Scenario | Behaviour |
|----------|-----------|
| Username not found in `users-by-name.json` | Return 401 — same message as wrong password, no enumeration |
| `profile.json` missing for a valid username entry | Return 500 with log — indicates data inconsistency |
| SSM unavailable at cold start | Lambda init fails; login endpoint returns 500 |
| `users-by-name.json` 412 on 4th retry | Return 500 — `POST /admin/users` surfaced as error |
| `newPassword` same as `currentPassword` | Return 422 `VALIDATION_ERROR` with `fields.newPassword` |
| `newPassword` fewer than 8 characters | Return 422 `VALIDATION_ERROR` |
| Expired JWT on write endpoint | Return 401 `UNAUTHORIZED` |
| Malformed JWT (bad signature, wrong alg) | Return 401 `UNAUTHORIZED` |

---

## Acceptance Criteria

### Happy Path

- [ ] `POST /auth/login` with valid credentials returns `{ token, expiresAt }` within 2s at p95.
- [ ] JWT decoded client-side has `sub` (userId), `username`, `exp` 24h in the future.
- [ ] SPA stores JWT in `localStorage` and includes it as `Authorization: Bearer` on subsequent writes.
- [ ] `POST /auth/password` with correct `currentPassword` and valid `newPassword` returns 200.
- [ ] After `POST /auth/password`, the old JWT continues to work for 24h from its original issue time.
- [ ] `POST /admin/users` creates `users/<userId>/profile.json`, `users/<userId>/index.json`, and updates `auth/users-by-name.json`.

### Error Handling

- [ ] Wrong password returns 401 with `"Invalid username or password"` — does not say which field is wrong.
- [ ] Non-existent username returns 401 with the same message as wrong password.
- [ ] 6th rapid login attempt within the rate window returns 429.
- [ ] `POST /auth/password` with wrong `currentPassword` returns 401 `WRONG_CURRENT_PASSWORD`.
- [ ] `POST /admin/users` with duplicate username (case-insensitive) returns 409.
- [ ] Expired JWT on `POST /entries/annotate` returns 401; SPA redirects to `/login?return=<current-path>`.

### Security

- [ ] Passwords are never logged (CloudWatch log has no `password` field).
- [ ] JWTs are never logged.
- [ ] `POST /auth/password` without a JWT returns 401 (not 422).
- [ ] `POST /admin/users` with a non-admin JWT returns 403.
- [ ] bcrypt hash stored in `profile.json` has cost factor ≥ 12 (verifiable by inspecting the `$2b$12$` prefix).
- [ ] JWT signing secret is not present in Lambda environment variables or source code.

### Edge Cases

- [ ] Login with username `"Peter"` succeeds when the stored username is `"peter"`.
- [ ] `POST /admin/users` with username `"Peter"` and existing user `"peter"` returns 409.
- [ ] Concurrent `POST /admin/users` calls creating different users both succeed (retry resolves the 412).

---

## Non-Functional Requirements

- **Performance**: Login completes within 2s at p95 (NFR-03). bcrypt cost 12 ≈ 250ms; total including SSM cache hit and S3 reads should be well within budget.
- **Security**: HS256, SSM SecureString, bcrypt cost ≥ 12 (NFR-11, NFR-12). CORS restricted to CloudFront domain (NFR-16). Rate limiting on login (NFR-17).
- **Cost**: Login Lambda provisioned concurrency = 0 (cold start acceptable). Reserved concurrency set low to limit blast radius from brute force.

---

## Out of Scope

- Password reset via email (FR-95 — no email infra in Phase 1)
- Self-registration (FR-06 — admin-created accounts only)
- JWT invalidation on password change (noted as acceptable Phase 1 trade-off)
- Multi-factor authentication
- OAuth / OIDC / Cognito

---

## Open Questions

| Question | Owner | Resolution |
|----------|-------|------------|
| Rate limiting implementation — Lambda reserved concurrency alone or WAF per-IP rule? | Peter / Implementation | Resolve during infra task planning |
