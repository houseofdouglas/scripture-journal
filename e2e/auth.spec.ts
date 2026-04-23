import { test, expect } from "@playwright/test";
import { seedAuth, seedExpiredAuth } from "./helpers/auth";
import { mockLoginSuccess, mockLoginFailure, mockUserIndex } from "./helpers/mocks";

// ---------------------------------------------------------------------------
// Redirect tests — no auth seeded
// ---------------------------------------------------------------------------

test("unauthenticated visit to / redirects to /login?return=/", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login\?return=%2F|\/login\?return=\//);
});

test("unauthenticated visit to /scripture redirects to /login?return=/scripture", async ({
  page,
}) => {
  await page.goto("/scripture");
  await expect(page).toHaveURL(/\/login\?return=%2Fscripture|\/login\?return=\/scripture/);
});

// ---------------------------------------------------------------------------
// Login form — success
// ---------------------------------------------------------------------------

test("successful login stores JWT and navigates to /", async ({ page }) => {
  await mockLoginSuccess(page);
  await mockUserIndex(page);
  await page.goto("/login");

  await page.getByLabel(/username/i).fill("peter");
  await page.getByLabel(/password/i).fill("secret");
  await page.getByRole("button", { name: /sign in/i }).click();

  await expect(page).toHaveURL("/");

  const jwt = await page.evaluate(() => localStorage.getItem("jwt"));
  expect(jwt).not.toBeNull();
});

// ---------------------------------------------------------------------------
// Login form — 401
// ---------------------------------------------------------------------------

test("401 shows error alert, clears password field, keeps username", async ({
  page,
}) => {
  await mockLoginFailure(page, 401);
  await page.goto("/login");

  await page.getByLabel(/username/i).fill("peter");
  await page.getByLabel(/password/i).fill("wrong");
  await page.getByRole("button", { name: /sign in/i }).click();

  await expect(page.getByRole("alert")).toBeVisible();

  const username = await page.getByLabel(/username/i).inputValue();
  expect(username).toBe("peter");

  const password = await page.getByLabel(/password/i).inputValue();
  expect(password).toBe("");
});

// ---------------------------------------------------------------------------
// Login form — 429
// ---------------------------------------------------------------------------

test("429 shows rate-limit alert and disables the form", async ({ page }) => {
  await mockLoginFailure(page, 429);
  await page.goto("/login");

  await page.getByLabel(/username/i).fill("peter");
  await page.getByLabel(/password/i).fill("spam");
  await page.getByRole("button", { name: /sign in/i }).click();

  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button", { name: /sign in/i })).toBeDisabled();
});

// ---------------------------------------------------------------------------
// ?return= param shows session-expired info alert
// ---------------------------------------------------------------------------

test("?return= param shows the session-expired info alert", async ({ page }) => {
  await page.goto("/login?return=/scripture");
  await expect(page.getByRole("alert")).toBeVisible();
});

// ---------------------------------------------------------------------------
// Log out
// ---------------------------------------------------------------------------

test("logging out clears localStorage and redirects to /login", async ({
  page,
}) => {
  await page.goto("/login");
  await seedAuth(page);
  await mockUserIndex(page);
  await page.goto("/");

  // Open nav dropdown and click Log Out
  await page.getByRole("button", { name: /peter/i }).click();
  await page.getByRole("button", { name: /log out/i }).click();

  await expect(page).toHaveURL(/\/login/);

  const jwt = await page.evaluate(() => localStorage.getItem("jwt"));
  expect(jwt).toBeNull();
});

// ---------------------------------------------------------------------------
// Expired JWT redirects to login
// ---------------------------------------------------------------------------

test("expired JWT in localStorage redirects to login on page load", async ({
  page,
}) => {
  await page.goto("/login");
  await seedExpiredAuth(page);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
});
