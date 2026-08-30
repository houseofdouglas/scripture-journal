import { test, expect } from "@playwright/test";
import { seedAuth } from "./helpers/auth";
import { mockChangePasswordSuccess, mockChangePasswordFailure } from "./helpers/mocks";

// ---------------------------------------------------------------------------
// Redirect tests — no auth seeded
// ---------------------------------------------------------------------------

test("unauthenticated visit to /change-password redirects to login", async ({
  page,
}) => {
  await page.goto("/settings/password");
  await expect(page).toHaveURL(/\/login\?return=.*settings.*password/i);
});

// ---------------------------------------------------------------------------
// Change password tests — authenticated
// ---------------------------------------------------------------------------

test("client-side validation: passwords don't match", async ({ page }) => {
  await page.goto("/login");
  await seedAuth(page);

  await page.goto("/settings/password");
  await page.getByLabel(/current password/i).fill("current123");
  await page.getByLabel(/^new password$/i).fill("newpassword123");
  await page.getByLabel(/confirm new password/i).fill("different123");
  await page.getByRole("button", { name: /update password/i }).click();

  await expect(
    page.getByText(/new passwords do not match/i),
  ).toBeVisible();
});

test("client-side validation: new password same as current", async ({
  page,
}) => {
  await page.goto("/login");
  await seedAuth(page);

  await page.goto("/settings/password");
  await page.getByLabel(/current password/i).fill("current123");
  await page.getByLabel(/^new password$/i).fill("current123");
  await page.getByLabel(/confirm new password/i).fill("current123");
  await page.getByRole("button", { name: /update password/i }).click();

  await expect(
    page.getByText(/new password must be different from your current password/i),
  ).toBeVisible();
});

test("success state after password change alert shown", async ({ page }) => {
  await page.goto("/login");
  await seedAuth(page);
  await mockChangePasswordSuccess(page);

  await page.goto("/settings/password");
  await page.getByLabel(/current password/i).fill("current123");
  await page.getByLabel(/^new password$/i).fill("newpassword123");
  await page.getByLabel(/confirm new password/i).fill("newpassword123");
  await page.getByRole("button", { name: /update password/i }).click();

  await expect(
    page.getByText(/password updated successfully/i),
  ).toBeVisible();
});

test("form fields reset after successful password change", async ({ page }) => {
  await page.goto("/login");
  await seedAuth(page);
  await mockChangePasswordSuccess(page);

  await page.goto("/settings/password");
  await page.getByLabel(/current password/i).fill("current123");
  await page.getByLabel(/^new password$/i).fill("newpassword123");
  await page.getByLabel(/confirm new password/i).fill("newpassword123");
  await page.getByRole("button", { name: /update password/i }).click();

  await expect(page.getByLabel(/current password/i)).toHaveValue("");
  await expect(page.getByLabel(/^new password$/i)).toHaveValue("");
  await expect(page.getByLabel(/confirm new password/i)).toHaveValue("");
});

test("401 error for wrong current password", async ({ page }) => {
  await page.goto("/login");
  await seedAuth(page);
  await mockChangePasswordFailure(page, 401);

  await page.goto("/settings/password");
  await page.getByLabel(/current password/i).fill("wrongcurrent123");
  await page.getByLabel(/^new password$/i).fill("newpassword123");
  await page.getByLabel(/confirm new password/i).fill("newpassword123");
  await page.getByRole("button", { name: /update password/i }).click();

  await expect(
    page.getByText(/current password is incorrect/i),
  ).toBeVisible();
});

test("server error handling", async ({ page }) => {
  await page.goto("/login");
  await seedAuth(page);
  await mockChangePasswordFailure(page, 500);

  await page.goto("/settings/password");
  await page.getByLabel(/current password/i).fill("current123");
  await page.getByLabel(/^new password$/i).fill("newpassword123");
  await page.getByLabel(/confirm new password/i).fill("newpassword123");
  await page.getByRole("button", { name: /update password/i }).click();

  await expect(
    page.getByText(/something went wrong/i),
  ).toBeVisible();
});

test("cancel button returns to dashboard", async ({ page }) => {
  await page.goto("/login");
  await seedAuth(page);

  await page.goto("/settings/password");
  await page.getByRole("button", { name: /cancel/i }).click();
  await expect(page).toHaveURL("/");
});

test("current password field cleared on 401 error", async ({ page }) => {
  await page.goto("/login");
  await seedAuth(page);
  await mockChangePasswordFailure(page, 401);

  await page.goto("/settings/password");
  await page.getByLabel(/current password/i).fill("wrongcurrent123");
  await page.getByLabel(/^new password$/i).fill("newpassword123");
  await page.getByLabel(/confirm new password/i).fill("newpassword123");
  await page.getByRole("button", { name: /update password/i }).click();

  await expect(page.getByLabel(/current password/i)).toHaveValue("");
});

test("form disabled during loading state", async ({ page }) => {
  await page.goto("/login");
  await seedAuth(page);
  // A same-tick mock response leaves no window in which to observe the
  // loading state, so delay it slightly (as e2e/past-entry.spec.ts does).
  await page.route("**/api/auth/password", (route) => {
    setTimeout(() => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
    }, 200);
  });

  await page.goto("/settings/password");

  // Not getByRole(name: /update password/i) — the button's accessible name
  // changes to "Saving…" while loading, so a name-based locator would stop
  // matching during the very state this test needs to observe.
  const submitButton = page.locator('form button[type="submit"]');

  await page.getByLabel(/current password/i).fill("current123");
  await page.getByLabel(/^new password$/i).fill("newpassword123");
  await page.getByLabel(/confirm new password/i).fill("newpassword123");

  const loadPromise = submitButton.click();

  await expect(submitButton).toBeDisabled();

  await loadPromise;

  await expect(submitButton).toBeEnabled();
});
