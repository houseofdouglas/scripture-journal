import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  reporter: [["html", { outputFolder: "playwright-report" }], ["list"]],
  use: {
    baseURL: "http://localhost:5173",
    screenshot: "only-on-failure",
    video: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium-headed",
      use: { ...devices["Desktop Chrome"], headless: false },
    },
  ],
  // Only Vite is needed — every API and content request is intercepted via
  // page.route() in e2e/helpers/mocks.ts, so the real Lambda dev server
  // (npm run dev:api, which requires .env.local) is not started here.
  webServer: {
    command: "npm run dev:vite",
    port: 5173,
    reuseExistingServer: true,
  },
});
