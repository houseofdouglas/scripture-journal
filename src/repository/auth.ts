import { randomUUID } from "crypto";
import { getObject, putObject } from "./s3-client";
import { conditionalWrite } from "./conditional-write";
import {
  UserProfileSchema,
  UsersByNameSchema,
  UserIndexSchema,
  type UserProfile,
  type UsersByName,
} from "../types";

// ── Key helpers ───────────────────────────────────────────────────────────────

const USERS_BY_NAME_KEY = "auth/users-by-name.json";
const profileKey = (userId: string) => `users/${userId}/profile.json`;
const indexKey = (userId: string) => `users/${userId}/index.json`;

// ── Read operations ───────────────────────────────────────────────────────────

/**
 * Resolve a username (case-insensitive) → full UserProfile.
 * Returns `null` for unknown usernames; never throws for a missing user.
 */
export async function getUserByUsername(username: string): Promise<UserProfile | null> {
  const normalized = username.toLowerCase();

  const mapResult = await getObject<UsersByName>(USERS_BY_NAME_KEY);
  if (!mapResult) return null;

  const map = UsersByNameSchema.parse(mapResult.data);
  const userId = map[normalized];
  if (!userId) return null;

  return getUserById(userId);
}

/**
 * Fetch a UserProfile by its UUID directly.
 * Returns `null` if the profile file does not exist.
 */
export async function getUserById(userId: string): Promise<UserProfile | null> {
  const result = await getObject<unknown>(profileKey(userId));
  if (!result) return null;
  return UserProfileSchema.parse(result.data);
}

// ── Write operations ──────────────────────────────────────────────────────────

export interface CreateUserInput {
  username: string;   // will be lowercased before storage
  passwordHash: string;
}

/**
 * Create a new user:
 *   1. Write `users/<id>/profile.json`
 *   2. Write `users/<id>/index.json` (empty UserIndex)
 *   3. Append username → userId to `auth/users-by-name.json` via conditionalWrite
 *
 * Callers are responsible for verifying username uniqueness before calling
 * (see auth service). The conditionalWrite on users-by-name handles concurrent
 * creation races, but the service should still check first to return a clean error.
 */
export async function createUser(input: CreateUserInput): Promise<UserProfile> {
  const userId = randomUUID();
  const normalized = input.username.toLowerCase();
  const now = new Date().toISOString();

  const profile: UserProfile = UserProfileSchema.parse({
    userId,
    username: normalized,
    passwordHash: input.passwordHash,
    createdAt: now,
  });

  const emptyIndex = UserIndexSchema.parse({ entries: [] });

  // Write profile and empty index in parallel (independent keys)
  await Promise.all([
    putObject(profileKey(userId), profile),
    putObject(indexKey(userId), emptyIndex),
  ]);

  // Append to username map with conditional write (handles concurrent creates)
  await conditionalWrite<UsersByName>(USERS_BY_NAME_KEY, (current) => {
    const map: UsersByName = current ?? {};
    return { ...map, [normalized]: userId };
  });

  return profile;
}

/**
 * Overwrite the `passwordHash` field of an existing user profile.
 * Uses a simple unconditional PUT — password changes are not concurrent
 * (protected by auth middleware and bcrypt re-verify in the service layer).
 */
export async function updatePasswordHash(userId: string, newHash: string): Promise<void> {
  const existing = await getUserById(userId);
  if (!existing) {
    throw new Error(`[auth-repo] User not found: ${userId}`);
  }

  const updated: UserProfile = UserProfileSchema.parse({
    ...existing,
    passwordHash: newHash,
  });

  await putObject(profileKey(userId), updated);
}
