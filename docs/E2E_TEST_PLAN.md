# Complete E2E Test Suite Plan

## Current State

**Existing E2E Tests (4 files):**
- `e2e/auth.spec.ts` - Login, logout, JWT handling
- `e2e/dashboard.spec.ts` - User index, entry cards
- `e2e/scripture-browser.spec.ts` - Navigation, chapter grid
- `e2e/annotation.spec.ts` - Adding/editing notes

**Infrastructure:**
- Playwright configured with Chromium (headless + headed)
- Helpers for auth seeding and API mocking
- Vitest for unit tests (80% coverage threshold)

---

## Missing E2E Coverage

### 1. Article View Tests (`e2e/article-view.spec.ts`)

**Test Cases:**
- [ ] Unauthenticated visit to `/articles/:id` redirects to login
- [ ] Article view shows article title in serif font
- [ ] Article view shows source link (clickable)
- [ ] Article view shows import date
- [ ] Article view shows annotation count badge
- [ ] Non-existent article shows "Article not found" with link to dashboard
- [ ] Clicking article entry card navigates to article view
- [ ] Back button from article view navigates to dashboard
- [ ] Article with multiple paragraphs renders correctly
- [ ] Annotations display with timestamps

**Mock Functions Needed:**
```typescript
async function mockArticle(page, articleData) {
  // Mock: /users/{userId}/entries/{entryId}/articles/{articleId}.json
  // Mock: /users/{userId}/entries/{entryId}.json (entry fetch)
}
```

---

### 2. Past Entry Tests (`e2e/past-entry.spec.ts`)

**Test Cases:**
- [ ] Unauthenticated visit to `/entries/:entryId` redirects to login
- [ ] Loading state display (skeleton loaders)
- [ ] 404 handling (entry not found) with dashboard link
- [ ] Past entry banner displays correct date format
- [ ] "Study Today" link navigates to scripture chapter
- [ ] "Study Today" is absent for article entries
- [ ] Annotation list renders with timestamps
- [ ] Multiple annotations display correctly
- [ ] Clicking dashboard link returns to dashboard

**Mock Functions Needed:**
```typescript
async function mockPastEntry(page, entryData) {
  // Mock: /users/{userId}/entries/{entryId}.json
}
```

---

### 3. Change Password Tests (`e2e/change-password.spec.ts`)

**Test Cases:**
- [ ] Unauthenticated visit to `/change-password` redirects to login
- [ ] Client-side validation: passwords don't match
- [ ] Client-side validation: new password same as current
- [ ] Success state after password change (alert shown)
- [ ] Form fields reset after successful password change
- [ ] 401 error for wrong current password
- [ ] Server error handling
- [ ] Cancel button returns to dashboard
- [ ] Current password field cleared on 401 error
- [ ] Form disabled during loading state

**Mock Functions Needed:**
```typescript
async function mockChangePasswordSuccess(page) {
  // Mock: POST /api/auth/password
}

async function mockChangePasswordFailure(page, status) {
  // Mock: POST /api/auth/password with error
}
```

---

### 4. Article Import Enhancements (`e2e/article-import.spec.ts`)

**Current Coverage:**
- Basic URL import flow
- Manual paste fallback

**Missing Test Cases:**

#### Domain Restrictions
- [ ] Domain not in allowlist shows error
- [ ] Error message displays specific domain restriction

#### Fetch Failures
- [ ] Network timeout shows fetch failed message
- [ ] "Paste article text manually" link available
- [ ] Clicking manual paste link switches to manual mode

#### Duplicate Detection
- [ ] Duplicate article shows "Already imported" modal
- [ ] "Open Existing" button navigates to article
- [ ] "Cancel" button closes modal

#### New Version Detection
- [ ] Updated article shows "New version" modal
- [ ] Shows previous import date
- [ ] Informs user annotations are preserved
- [ ] "Create New Version" button works
- [ ] "Open Previous Version" button works
- [ ] "Cancel" button closes modal

**Mock Functions Needed:**
```typescript
async function mockImportDuplicate(page, articleId, title, importedAt) {
  // Mock: POST /api/articles/import → { status: "DUPLICATE" }
}

async function mockImportNewVersion(page, articleId, title, previousArticleId, importedAt) {
  // Mock: POST /api/articles/import → { status: "NEW_VERSION" }
}

async function mockImportVersionSuccess(page, articleId, title, previousArticleId, importedAt) {
  // Mock: POST /api/articles/import (with confirm) → { status: "VERSION_IMPORTED" }
}
```

---

## Implementation Priority

**Phase 1 - High Priority:**
1. Article view tests (most critical missing feature)
2. Change password tests (security-related)

**Phase 2 - Medium Priority:**
3. Past entry tests
4. Article import duplicates/new versions

**Phase 3 - Nice to Have:**
5. End-to-end flow tests (e.g., import article → view → annotate)

---

## Helper Updates Required

### Update `e2e/helpers/auth.ts` (if needed)
- No changes needed currently

### Update `e2e/helpers/mocks.ts`
- [ ] Add `mockArticle()` helper
- [ ] Add `mockPastEntry()` helper
- [ ] Add `mockChangePasswordSuccess()` helper
- [ ] Add `mockChangePasswordFailure()` helper
- [ ] Add `mockImportDuplicate()` helper
- [ ] Add `mockImportNewVersion()` helper
- [ ] Add `mockImportVersionSuccess()` helper

---

## Running Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run with UI
npm run test:e2e:ui

# Run specific file
npx playwright test e2e/article-view.spec.ts

# Run in headed mode for debugging
npm run test:e2e:headed
```

---

## Acceptance Criteria

- [ ] All missing E2E tests pass
- [ ] Test coverage >= 80% for service layer
- [ ] No flaky tests (deterministic mocks)
- [ ] CI/CD integration (Playwright runs on PRs)
