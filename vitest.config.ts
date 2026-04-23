import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Exclude Playwright E2E specs — those run via `npx playwright test`
    exclude: ["e2e/**", "**/node_modules/**"],
    // Node environment for Lambda/S3/SSM tests
    environment: "node",
    // Sets env vars before any module is imported (env.ts validates eagerly)
    setupFiles: ["src/__tests__/setup.ts"],
    // Isolate modules between test files so vi.mock() doesn't bleed across
    isolate: true,
    // Show a compact summary — good for CI output
    reporters: ["verbose"],
    coverage: {
      provider: "v8",
      include: ["src/service/**/*.ts", "src/repository/**/*.ts", "src/handler/**/*.ts"],
      exclude: ["**/__tests__/**", "**/errors.ts"],
      thresholds: {
        lines: 80,
        functions: 80,
      },
    },
  },
});
