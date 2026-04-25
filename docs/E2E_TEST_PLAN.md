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
- [x] Unauthenticated visit to `/articles/:id` redirects to login
- [x] Article view shows article title in serif font
- [x] Article view shows source link (clickable)
- [x] Article view shows import date
- [x] Article view shows annotation count badge
- [x] Non-existent article shows "Article not found" with link to dashboard
- [x] Clicking article entry card navigates to article view
- [x] Back button from article view navigates to dashboard
- [x] Article with multiple paragraphs renders correctly
- [x] Annotations display with timestamps

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
- [x] Unauthenticated visit to `/entries/:entryId` redirects to login
- [x] Loading state display (skeleton loaders)
- [x] 404 handling (entry not found) with dashboard link
- [x] Past entry banner displays correct date format
- [x] "Study Today" link navigates to scripture chapter
- [x] "Study Today" is absent for article entries
- [x] Annotation list renders with timestamps
- [x] Multiple annotations display correctly
- [x] Clicking dashboard link returns to dashboard

**Mock Functions Needed:**
```typescript
async function mockPastEntry(page, entryData) {
  // Mock: /users/{userId}/entries/{entryId}.json
}
```

---

### 3. Change Password Tests (`e2e/change-password.spec.ts`)

**Test Cases:**
- [x] Unauthenticated visit to `/change-password` redirects to login
- [x] Client-side validation: passwords don't match
- [x] Client-side validation: new password same as current
- [x] Success state after password change (alert shown)
- [x] Form fields reset after successful password change
- [x] 401 error for wrong current password
- [x] Server error handling
- [x] Cancel button returns to dashboard
- [x] Current password field cleared on 401 error
- [x] Form disabled during loading state

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
- [x] Domain not in allowlist shows error
- [x] Error message displays specific domain restriction

#### Fetch Failures
- [x] Network timeout shows fetch failed message
- [x] "Paste article text manually" link available
- [x] Clicking manual paste link switches to manual mode

#### Duplicate Detection
- [x] Duplicate article shows "Already imported" modal
- [x] "Open Existing" button navigates to article
- [x] "Cancel" button closes modal

#### New Version Detection
- [x] Updated article shows "New version" modal
- [x] Shows previous import date
- [x] Informs user annotations are preserved
- [x] "Create New Version" button works
- [x] "Open Previous Version" button works
- [x] "Cancel" button closes modal

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

**Phase 1 - High Priority (COMPLETED):**
1. Article view tests (most critical missing feature) ✓
2. Change password tests (security-related) ✓

**Phase 2 - Medium Priority (COMPLETED):**
3. Past entry tests ✓
4. Article import duplicates/new versions ✓

**Phase 3 - Nice to Have:**
5. End-to-end flow tests (e.g., import article → view → annotate)

---

## Helper Updates Required

### Update `e2e/helpers/auth.ts` (if needed)
- No changes needed currently

### Update `e2e/helpers/mocks.ts`
- [x] Add `mockArticle()` helper
- [x] Add `mockPastEntry()` helper
- [x] Add `mockChangePasswordSuccess()` helper
- [x] Add `mockChangePasswordFailure()` helper
- [x] Add `mockImportDuplicate()` helper
- [x] Add `mockImportNewVersion()` helper
- [x] Add `mockImportVersionSuccess()` helper

---

## Running Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run with UI
npm run test:e2e:ui

# Run specific file
npx playwright test e2e/article-view.spec.ts
npx playwright test e2e/past-entry.spec.ts
npx playwright test e2e/change-password.spec.ts
npx playwright test e2e/article-import.spec.ts

# Run in headed mode for debugging
npm run test:e2e:headed
```

---

## Acceptance Criteria

- [x] All missing E2E tests pass
- [ ] Test coverage >= 80% for service layer
- [ ] No flaky tests (deterministic mocks)
- [ ] CI/CD integration (Playwright runs on PRs)
