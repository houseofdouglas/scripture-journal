# Specs

Specs are the source of truth. Code is derived from specs.

## Active Specs

| Spec | File | Summary |
|------|------|---------|
| Auth | [auth.md](auth.md) | Login, change password, admin user creation, JWT lifecycle (HS256, 24h, SSM secret) |
| Scripture Browsing | [scripture-browsing.md](scripture-browsing.md) | Browse Standard Works (Work → Book → Chapter), read verse lists, prev/next chapter nav |
| Annotation | [annotation.md](annotation.md) | Inline "+" note editor, journal entry find-or-create, append-only saves, S3 conditional write with retry |
| Dashboard | [dashboard.md](dashboard.md) | Entry list (single vs. grouped day cards), calendar view, past entry read-only view |

## Completed Specs

| Spec | File | Summary | Acceptance Report |
|------|------|---------|---|
| Article Import | [article-import.md](article-import.md) | Import from churchofjesuschrist.org, SHA-256 content-addressing, duplicate/version detection, manual paste fallback | [2026-04-26](../plans/completed/article-import-acceptance-2026-04-26.md) |
