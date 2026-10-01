// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import vitest from "@vitest/eslint-plugin";
import globals from "globals";

const TEST_FILES = ["src/**/__tests__/**/*.{ts,tsx}", "src/**/*.test.{ts,tsx}"];
const NODE_SRC = ["src/handler/**", "src/service/**", "src/repository/**", "src/config/**"];

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "coverage/**",
      "infra/**",
      ".claude/worktrees/**",
      "playwright-report/**",
      "test-results/**",
      "cdk.out/**",
    ],
  },

  js.configs.recommended,
  tseslint.configs.recommended,

  // Constitution rules that apply to every TypeScript file.
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        // `vi.importActual<typeof import("…")>` is the idiomatic Vitest pattern.
        { fixStyle: "inline-type-imports", disallowTypeAnnotations: false },
      ],
    },
  },

  // Application source: type-aware linting (src/ is covered by tsconfig.json).
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Structured logging goes through src/lib/log.ts — see constitution.md.
      "no-console": "error",
      // `onSubmit={handleSubmit}` with an async handler is idiomatic React;
      // the handlers catch their own errors.
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { attributes: false } }],
    },
  },
  {
    files: ["src/lib/log.ts"],
    rules: { "no-console": "off" },
  },

  // Backend (Lambda) code runs on Node.
  {
    files: NODE_SRC,
    languageOptions: { globals: globals.node },
  },

  // Frontend: React + hooks, browser globals.
  {
    files: ["src/ui/**/*.{ts,tsx}"],
    extends: [
      react.configs.flat.recommended,
      react.configs.flat["jsx-runtime"],
    ],
    plugins: { "react-hooks": reactHooks },
    languageOptions: { globals: globals.browser },
    settings: { react: { version: "detect" } },
    rules: {
      // The classic hooks rules only — the React Compiler rules in the plugin's
      // recommended preset assume a compiler this project does not use.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },

  // Vitest unit tests.
  {
    files: TEST_FILES,
    extends: [vitest.configs.recommended],
    languageOptions: { globals: { ...globals.node, ...vitest.environments.env.globals } },
    rules: {
      // Mocks and fixtures routinely hand partial/loosely-typed values around.
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/unbound-method": "off",
      // AWS SDK / fetch stubs mirror async interfaces without awaiting anything.
      "@typescript-eslint/require-await": "off",
    },
  },

  // CLI scripts, Playwright specs and root tool configs: Node, not type-checked
  // (they sit outside tsconfig.json). CLI scripts print to the terminal.
  {
    files: ["scripts/**", "e2e/**", "*.{js,ts}"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["scripts/**"],
    rules: { "no-console": "off" },
  },
);
