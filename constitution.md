# Constitution

> This file is immutable context for all AI operations. Changes require deliberate architectural decisions. Do not edit during feature implementation.

## Project Identity

- **Name**: scripture-journal
- **Description**: A web-based journaling tool that preserves source content (LDS Standard Works and imported articles) and lets the user attach block-level annotations tied to specific verses or paragraphs.
- **Started**: 2026-04-21
- **Owner**: Peter (peter@neverbehind.com)

## Technology Stack

### Frontend
- **Framework**: React + Vite (SPA)
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS
- **Testing**: Vitest + Testing Library

### Backend
- **Runtime**: Node.js 22.x (AWS Lambda, ARM64)
- **Language**: TypeScript
- **HTTP Framework**: Hono on Lambda Function URLs
- **Validation**: Zod (all boundary inputs)
- **Testing**: Vitest + aws-sdk-client-mock

### Data Layer
- **Primary Storage**: S3 (pure content-addressed — no database)
- **File Storage**: S3 (same bucket, namespaced by prefix)
- **Concurrency**: S3 `If-Match` / `If-None-Match` conditional writes (optimistic)
- **Cache**: CloudFront edge cache (reads); no server-side cache

### Infrastructure
- **Cloud**: AWS
- **Region**: `us-east-1`
- **IaC**: Terraform (HCL). Lambda bundles produced by `esbuild` in a pre-apply build step.
- **Terraform state**: S3 backend with native state locking (`use_lockfile = true`, Terraform ≥ 1.10). State in `s3://818371815071-tf-state/scripture-journal/terraform.tfstate` — **separate bucket** from app data.
- **Hosting**: S3 + CloudFront (static SPA) — reads go straight to S3 via CloudFront; writes go through Lambda Function URLs
- **Auth**: Custom username/password with bcrypt hashes and signed JWT (HS256, secret in SSM)
- **CI/CD**: GitHub Actions → `terraform apply`

## Architecture Layers

Dependencies flow forward only. No circular dependencies. No skipping layers.

```
Types → Config → Repository → Service → Handler → API → UI
```

- **Types**: Zod schemas, TypeScript interfaces, shared enums
- **Config**: Environment variables, JWT secret refs, S3 bucket name
- **Repository**: All S3 I/O. No business logic. Handles ETag/conditional writes.
- **Service**: Business logic (auth, entry composition, content import). No HTTP context. No direct S3 calls.
- **Handler**: Lambda function entry points (Hono routes). Calls services. Returns HTTP responses.
- **API**: Lambda Function URL configuration, JWT middleware
- **UI**: React components, pages, state (TanStack Query for server state)

Cross-cutting concerns (auth, logging) enter via explicit middleware, not imports scattered across layers.

## Storage Layout (S3)

```
s3://{bucket}/
├── content/
│   ├── scripture/<work>/<book>/<chapter>.json   # pre-loaded, immutable
│   └── articles/<sha256>.json                   # write-once on import
├── users/<userId>/
│   ├── profile.json                             # username, password hash
│   ├── entries/<entryId>.json                   # one journal entry
│   └── index.json                               # list of entries (Phase 2 queries)
└── auth/
    └── users-by-name.json                       # username → userId lookup
```

All per-user files are written only by that user's session. Shared files (`auth/users-by-name.json`) use optimistic concurrency (`If-Match`) with retry-on-412.

## Coding Standards

- TypeScript strict mode: `"strict": true` in tsconfig
- No `any` types (use `unknown` and narrow)
- Explicit return types on all exported functions
- All async functions handle errors explicitly — no unhandled promise rejections
- Structured logging: `{ level, message, ...context }` — not `console.log` strings
- No secrets in code — use AWS SSM Parameter Store or Secrets Manager

## Naming Conventions

- **Files/Directories**: kebab-case (`user-profile.ts`, `auth-service.ts`)
- **Types/Interfaces**: PascalCase (`UserProfile`, `AuthResult`)
- **Functions/Variables**: camelCase (`getUserById`, `isAuthenticated`)
- **Constants**: SCREAMING_SNAKE_CASE (`MAX_RETRY_COUNT`)
- **Lambda Functions**: `scripture-journal-{resource}-{action}-{env}` (e.g., `scripture-journal-entry-save-dev`)
- **S3 Buckets**: `scripture-journal-{purpose}-{account-id}-{env}`
- **S3 Object keys**: lowercase, `/`-delimited, no spaces

## Security Rules

- All API inputs validated with Zod at the handler layer
- Authentication required by default on all write endpoints — explicitly opt endpoints out (document why)
- CORS restricted to the CloudFront distribution origin (not `*` in production)
- JWT: HS256, signed with a secret stored in SSM Parameter Store (SecureString); 24h expiry; rotated on password change
- Passwords: bcrypt with cost factor ≥ 12
- No PII in CloudWatch logs (usernames OK; passwords, tokens, annotation text never)
- S3 buckets: block all public access; content served only via CloudFront with an Origin Access Control
- Rate limiting on public write endpoints (login, signup) via Lambda concurrency limits + per-IP throttling

## Test Requirements

- Business logic (service layer): 80% line coverage minimum
- Repository layer: mocked, not integration-tested in unit tests
- Handler layer: test happy path + key error paths (401, 404, 409, 422)
- Acceptance criteria from specs: each criterion must have at least one test

## Definition of Done

A task is done when:
- [ ] Implementation matches spec acceptance criteria
- [ ] TypeScript compiles with zero errors (`tsc --noEmit`)
- [ ] ESLint passes with zero warnings
- [ ] Relevant tests written and passing
- [ ] No `console.log` debugging left in code
- [ ] Deployed to dev environment and smoke-tested

## Architecture Decision Log

Document significant decisions in `docs/adr/`. Format: `{date}-{decision}.md`.

Decisions worth recording so far:
- 2026-04-21 — Pure content-addressed storage (S3 JSON, no DB)
- 2026-04-21 — Custom JWT auth (no Cognito) for lowest cost and simplest login UX
- 2026-04-21 — Terraform over AWS CDK for IaC; state in a separate S3 bucket
