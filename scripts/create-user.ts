/**
 * create-user.ts
 *
 * Provisions a user account in the app-data S3 bucket.
 * Exits 0 if the user was created or already exists; exits 1 on error.
 *
 * Usage:
 *   npm run create-user -- --username peter --password "s3cr3t"
 *   npm run create-user:deployed -- --username peter --password "s3cr3t"
 *
 * Environment (resolved in order):
 *   1. .env.local   (local dev — loaded automatically)
 *   2. .env         (deployed — loaded via create-user:deployed script)
 *   3. Real process.env  (Lambda / CI — BUCKET_NAME must be set)
 */

// env is loaded via `tsx --env-file .env.local` or `tsx --env-file .env` (see package.json).
// In deployed / CI environments the real process.env vars are already present.

import { parseArgs } from "node:util";
import { createUser } from "../src/service/auth.js";
import { getUserByUsername } from "../src/repository/auth.js";
import { UsernameTakenError } from "../src/service/errors.js";
import { getJwtSecret } from "../src/config/secrets.js";

// ── CLI args ──────────────────────────────────────────────────────────────────

const { values } = parseArgs({
  options: {
    username: { type: "string", short: "u" },
    password: { type: "string", short: "p" },
  },
  strict: true,
});

if (!values.username || !values.password) {
  console.error("Usage: npm run create-user [--env-file .env] -- --username <name> --password <pass>");
  process.exit(1);
}

const username = values.username.trim().toLowerCase();
const password = values.password;

// ── Initialize JWT secret (for auth) ──────────────────────────────────────────

async function initialize() {
  try {
    const secret = await getJwtSecret();
    console.log(`ℹ️  JWT secret loaded from ${process.env.JWT_SECRET ? 'JWT_SECRET env var' : 'SSM'}`);
  } catch (err) {
    console.error("❌ Failed to load JWT secret:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Initialize JWT secret (required for auth service)
  await initialize();

  // Check first so we can give a friendly "already exists" message instead of an error.
  const existing = await getUserByUsername(username);
  if (existing) {
    console.log(`ℹ️  User "${username}" already exists (userId: ${existing.userId}). Nothing to do.`);
    return;
  }

  try {
    const { userId } = await createUser({ username, password });
    console.log(`✅ Created user "${username}" (userId: ${userId})`);
  } catch (err) {
    if (err instanceof UsernameTakenError) {
      // Race condition — another process created the user between our check and the write.
      console.log(`ℹ️  User "${username}" was just created by another process. Nothing to do.`);
      return;
    }
    throw err;
  }
}

main().catch((err) => {
  console.error("❌ create-user failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
