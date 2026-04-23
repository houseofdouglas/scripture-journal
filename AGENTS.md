# scripture-journal

A web-based journaling tool that preserves source content (LDS Standard Works and imported articles from churchofjesuschrist.org and, later, arbitrary sources) and lets the owner attach block-level annotations tied to specific verses or paragraphs. Hosted on AWS at near-zero idle cost using a pure content-addressed (S3 + CloudFront) architecture — no database tier.

## Map

- **[constitution.md](constitution.md)** — tech stack, coding standards, security rules, storage layout. Read before making any architectural change. Immutable during feature work.
- **[docs/briefs/](docs/briefs/)** — project briefs (the why, before the what)
- **[docs/specs/](docs/specs/)** — machine-readable feature specs. **Specs are the source of truth.** Code is derived from specs.
- **[docs/tasks/](docs/tasks/)** — atomic task lists per feature. What's being worked on right now.
- **[docs/plans/active/](docs/plans/active/)** — in-flight execution plans
- **[docs/plans/completed/](docs/plans/completed/)** — finished plans (version history)
- **[docs/design/](docs/design/)** — architecture diagrams, system design notes
- **[docs/adr/](docs/adr/)** — Architecture Decision Records (`{date}-{decision}.md`)
- **[src/](src/)** — application source (frontend + backend)
- **[infra/](infra/)** — Terraform stack (HCL). State in a separate S3 bucket (see `constitution.md`).

## When starting a new task

1. **Read the relevant spec first** in `docs/specs/`. If no spec exists for the work, write one via `/write-spec` before coding.
2. Check `constitution.md` for constraints that apply (storage layout, auth model, naming).
3. Create or update a task list in `docs/tasks/` and an execution plan in `docs/plans/active/`.
4. Implement, test, then move the plan to `docs/plans/completed/`.

## Workflow commands

- `/intake` — capture a raw idea into a brief
- `/requirements` — expand a brief into full requirements
- `/write-spec` — turn requirements into a machine-readable spec
- `/plan-tasks` — break a spec into atomic tasks
- `/next-task` — implement the next pending task
- `/check-acceptance` — validate implementation against spec

## Key constraints (see constitution.md for the full list)

- **No database.** All state lives in S3 as JSON. Reads via CloudFront; writes via Lambda with conditional PUTs.
- **Auth is custom** (username/password + JWT). No IdP in Phase 1.
- **Multi-user from day one** via `users/<userId>/` prefixes, even though only one account exists initially.
- **Source content is plain text only** — footnotes, hyperlinks, and cross-references from imported articles are stripped.
