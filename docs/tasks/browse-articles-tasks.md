# Tasks: Browse Articles

**Spec**: [docs/specs/browse-articles.md](../specs/browse-articles.md)
**Requirements**: [docs/requirements/browse-articles-requirements.md](../requirements/browse-articles-requirements.md)
**Created**: 2026-04-27
**Status**: PENDING

---

## Task: BA-01 — Add ArticleIndex type and Zod schema

**Layer**: Types
**Estimate**: 30min
**Depends on**: none
**Status**: PENDING

### What to build
Add `ArticleIndexEntrySchema`, `ArticleIndexSchema`, and their inferred TypeScript types to `src/types/article.ts`. Export them from `src/types/index.ts`. The schema validates the shape of `content/articles/index.json` at read time: an object with an `articles` array, each entry having `articleId` (64-char hex), `title` (non-empty string), `sourceUrl` (valid URL), and `importedAt` (ISO 8601 datetime).

### Acceptance criteria
- [ ] `ArticleIndexSchema` and `ArticleIndex` type are exported from `src/types/index.ts`
- [ ] Schema rejects entries with invalid `articleId` length, empty `title`, non-URL `sourceUrl`, or non-datetime `importedAt`
- [ ] `tsc --noEmit` passes with zero errors

### Files expected
- `src/types/article.ts` — add `ArticleIndexEntrySchema`, `ArticleIndexSchema`, exported types

---

## Task: BA-02 — Repository: read and update ArticleIndex

**Layer**: Repository
**Estimate**: 1hr
**Depends on**: BA-01
**Status**: PENDING

### What to build
Add two functions to `src/repository/article.ts`:
- `getArticleIndex()`: reads `content/articles/index.json` via `getObject`. Returns `{ data: ArticleIndex; etag: string }` on success, or `null` on 404. Parses with `ArticleIndexSchema`.
- `updateArticleIndex(mutate: (current: ArticleIndex | null) => ArticleIndex)`: wraps `conditionalWrite` to perform a read-modify-write with ETag. Treat a 404 (null `current`) as an empty index `{ articles: [] }`. Max 3 retries on 412.

The S3 key is the constant `content/articles/index.json`.

### Acceptance criteria
- [ ] `getArticleIndex()` returns `null` for a 404 response
- [ ] `getArticleIndex()` parses and returns a valid `ArticleIndex` on success
- [ ] `updateArticleIndex()` retries up to 3 times on 412 conflict, then throws
- [ ] `updateArticleIndex()` passes `{ articles: [] }` as `current` when the index does not yet exist
- [ ] `tsc --noEmit` passes

### Files expected
- `src/repository/article.ts` — add `getArticleIndex`, `updateArticleIndex`

---

## Task: BA-03 — Infra: CloudFront invalidation permission and env var

**Layer**: Config + Infra
**Estimate**: 1hr
**Depends on**: none
**Status**: PENDING

### What to build
Two parts:

**Terraform** (`infra/lambda.tf`): add an IAM inline policy granting `cloudfront:CreateInvalidation` on the CloudFront distribution ARN. Add `CLOUDFRONT_DISTRIBUTION_ID` to the Lambda function's `environment` block, sourced from `aws_cloudfront_distribution.app.id`.

**Config** (`src/config/env.ts`): add `CLOUDFRONT_DISTRIBUTION_ID: z.string().min(1)` to `EnvSchema` so it is eagerly validated at cold start.

### Acceptance criteria
- [ ] `CLOUDFRONT_DISTRIBUTION_ID` present in `EnvSchema` and validated at startup
- [ ] Terraform plan shows new IAM policy statement granting `cloudfront:CreateInvalidation`
- [ ] `CLOUDFRONT_DISTRIBUTION_ID` wired into the Lambda environment block in Terraform
- [ ] `tsc --noEmit` passes

### Files expected
- `infra/lambda.tf` — IAM policy + env var
- `src/config/env.ts` — `CLOUDFRONT_DISTRIBUTION_ID` field

---

## Task: BA-04 — Service: maintain ArticleIndex after successful import

**Layer**: Service
**Estimate**: 1hr
**Depends on**: BA-02, BA-03
**Status**: PENDING

### What to build
Modify `writeArticle()` in `src/service/article-import.ts`. After `putArticle` and `updateArticleUrlIndex` succeed:

1. Call `updateArticleIndex` with a mutator that:
   - For a fresh import (`IMPORTED`): prepends `{ articleId, title, sourceUrl, importedAt }` to `articles[]`.
   - For a version import (`VERSION_IMPORTED`): removes any existing entry whose `sourceUrl` matches, then prepends the new entry.
2. After the index write succeeds, issue a CloudFront invalidation for `/content/articles/index.json` using `CloudFrontClient` from `@aws-sdk/client-cloudfront` with `CreateInvalidationCommand`. Use `env.CLOUDFRONT_DISTRIBUTION_ID`. A `CallerReference` of `articleId` is sufficient (unique per write).

The response returned to the handler is unchanged.

### Acceptance criteria
- [ ] On `IMPORTED`: index gains a new prepended entry for the new article
- [ ] On `VERSION_IMPORTED`: old entry for the same `sourceUrl` is removed; new entry is prepended
- [ ] CloudFront invalidation is called with path `/content/articles/index.json` after index write
- [ ] CloudFront invalidation is NOT called on `DUPLICATE` or `NEW_VERSION` (no write occurred)
- [ ] `tsc --noEmit` passes

### Files expected
- `src/service/article-import.ts` — modified `writeArticle()`

---

## Task: BA-05 — Tests: service and handler coverage for index maintenance

**Layer**: Test
**Estimate**: 1hr
**Depends on**: BA-04
**Status**: PENDING

### What to build
Update `src/service/__tests__/article-import.test.ts` to mock `updateArticleIndex` (from the repository) and a CloudFront `CloudFrontClient`. Add test cases:
- Fresh import calls `updateArticleIndex` with a mutator that prepends the new entry.
- Version import calls `updateArticleIndex` with a mutator that replaces the old entry.
- `DUPLICATE` response: `updateArticleIndex` is not called.
- `NEW_VERSION` (unconfirmed) response: `updateArticleIndex` is not called.
- CloudFront `CreateInvalidationCommand` is called with the correct distribution ID and path on `IMPORTED` and `VERSION_IMPORTED`.
- CloudFront invalidation is not called on `DUPLICATE` or `NEW_VERSION`.

Check `src/handler/__tests__/article.test.ts` — the handler response contract is unchanged, so only add a mock for the new repo function if the test setup requires it to avoid unhandled-call errors.

### Acceptance criteria
- [ ] All new test cases pass under `vitest`
- [ ] No existing tests broken
- [ ] `updateArticleIndex` and CloudFront mock not called in DUPLICATE / NEW_VERSION paths
- [ ] Service layer coverage remains ≥ 80% lines

### Files expected
- `src/service/__tests__/article-import.test.ts` — extended with new cases
- `src/handler/__tests__/article.test.ts` — mock updates if needed

---

## Task: BA-06 — UI: useArticleIndex query hook

**Layer**: UI
**Estimate**: 30min
**Depends on**: BA-01
**Status**: PENDING

### What to build
Create `src/ui/lib/queries/articles.ts` with a `useArticleIndex()` hook using TanStack Query. The hook fetches `content/articles/index.json` from the CloudFront origin (same base URL pattern as scripture queries). On 404, return `{ articles: [] }` — not an error. On other non-2xx or parse failure, surface as an error. Use `staleTime: 0` (no caching — the index is invalidated at CloudFront after each import, so we always want a fresh fetch when the page loads).

### Acceptance criteria
- [ ] Hook returns `{ data: ArticleIndex, isLoading, isError }` shape
- [ ] 404 response resolves to `{ articles: [] }`, `isError: false`
- [ ] Non-404 network failure surfaces as `isError: true`
- [ ] `tsc --noEmit` passes

### Files expected
- `src/ui/lib/queries/articles.ts` — new file with `useArticleIndex`

---

## Task: BA-07 — UI: ArticleBrowserPage, Nav link, and route

**Layer**: UI
**Estimate**: 2hr
**Depends on**: BA-06
**Status**: PENDING

### What to build
Three small changes wired together:

**`src/ui/pages/ArticleBrowserPage.tsx`** (new): uses `useArticleIndex()`. Renders:
- Loading state: skeleton grid (4 placeholder cards matching the card dimensions).
- Error state: "Could not load articles. Check your connection and try again." + Retry button (calls `refetch()`).
- Empty state (`articles.length === 0`): "No articles imported yet." + Link to `/import`.
- Populated state: search `<input>` above a responsive card grid. Each card shows title (truncated, ellipsis), domain extracted via `new URL(sourceUrl).hostname`, and `importedAt` formatted as `MMM D, YYYY` using `Date.toLocaleDateString`. Clicking a card navigates to `/articles/<articleId>`. Search filters client-side on title and `sourceUrl`, case-insensitive substring. Zero-results state shows "No articles match your search." The cards match the visual style of the scripture work-selection grid (same Tailwind classes for card borders, hover, padding, and grid columns).

**`src/ui/components/Nav.tsx`**: replace `<Link to="/scripture">` and `<Link to="/import">` with `<NavLink>` from `react-router-dom`. Add a third `<NavLink to="/articles">Browse Articles</NavLink>`. Use `NavLink`'s `className` callback to add an active style (e.g., `font-semibold text-gray-900`) when the route is active.

**`src/ui/main.tsx`**: add a `<Route path="/articles" element={<ProtectedRoute><ArticleBrowserPage /></ProtectedRoute>} />` before the `/articles/:articleId` route.

### Acceptance criteria
- [ ] "Browse Articles" link appears in the nav between "Browse Scripture" and "Import Article"
- [ ] Link is visually active (bold / darker) when current route is `/articles`
- [ ] Loading skeleton renders while `useArticleIndex` is pending
- [ ] Empty state renders with link to `/import` when `articles` is empty
- [ ] Card grid renders one card per article entry, sorted as received (index is pre-sorted)
- [ ] Each card shows title, domain, and formatted import date
- [ ] Clicking a card navigates to the correct `/articles/<articleId>` URL
- [ ] Search input filters in real time; zero-results shows "No articles match your search."
- [ ] Error state renders with Retry button on fetch failure
- [ ] `/articles` route is protected (redirects to `/login` if unauthenticated)
- [ ] `tsc --noEmit` passes

### Files expected
- `src/ui/pages/ArticleBrowserPage.tsx` — new page component
- `src/ui/components/Nav.tsx` — add Browse Articles NavLink, convert existing links to NavLink
- `src/ui/main.tsx` — register `/articles` route
