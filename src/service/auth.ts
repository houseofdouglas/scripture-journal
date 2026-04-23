import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { getJwtSecret } from "../config/secrets";
import { env } from "../config/env";
import {
  getUserByUsername,
  getUserById,
  createUser as repoCreateUser,
  updatePasswordHash,
} from "../repository/auth";
import type { JwtPayload, LoginResponse, CreateUserRequest } from "../types";
import {
  InvalidCredentialsError,
  UnauthorizedError,
  ValidationError,
  UsernameTakenError,
} from "./errors";

const BCRYPT_COST = 12;

// ── Login ─────────────────────────────────────────────────────────────────────

/**
 * Authenticate with username + password. Returns a signed JWT and its
 * expiry timestamp on success.
 *
 * Throws `InvalidCredentialsError` for unknown username OR wrong password —
 * same error, no enumeration.
 */
export async function login(username: string, password: string): Promise<LoginResponse> {
  const user = await getUserByUsername(username);
  if (!user) throw new InvalidCredentialsError();

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) throw new InvalidCredentialsError();

  return signToken(user.userId, user.username);
}

// ── Token verification ────────────────────────────────────────────────────────

/**
 * Verify and decode a Bearer token.
 *
 * Throws `UnauthorizedError` on missing, expired, or malformed JWTs.
 */
export async function verifyToken(token: string): Promise<JwtPayload> {
  const secret = await getJwtSecret();
  const key = new TextEncoder().encode(secret);

  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });

    return {
      sub: payload.sub as string,
      username: payload["username"] as string,
      iat: payload.iat as number,
      exp: payload.exp as number,
    };
  } catch {
    throw new UnauthorizedError("Token is invalid or expired");
  }
}

// ── Change password ───────────────────────────────────────────────────────────

/**
 * Re-verify the current password, then replace the hash with a new one.
 *
 * The existing JWT remains valid after the change (no server-side token store).
 *
 * Throws:
 * - `InvalidCredentialsError` if `currentPassword` does not match
 * - `ValidationError` if `newPassword === currentPassword`
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  if (currentPassword === newPassword) {
    throw new ValidationError({
      newPassword: "New password must be different from your current password",
    });
  }

  const user = await getUserById(userId);
  if (!user) throw new UnauthorizedError("User not found");

  const match = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!match) throw new InvalidCredentialsError();

  const newHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  await updatePasswordHash(userId, newHash);
}

// ── Admin: create user ────────────────────────────────────────────────────────

/**
 * Create a new user account. Only callable by an admin (enforced in handler).
 *
 * Throws:
 * - `UsernameTakenError` if the username is already registered
 */
export async function createUser(input: CreateUserRequest): Promise<{ userId: string }> {
  const normalized = input.username.toLowerCase();

  const existing = await getUserByUsername(normalized);
  if (existing) throw new UsernameTakenError(normalized);

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);

  const profile = await repoCreateUser({ username: normalized, passwordHash });

  return { userId: profile.userId };
}

// ── Admin check ───────────────────────────────────────────────────────────────

/**
 * Returns true if the JWT payload belongs to the configured admin user.
 */
export function isAdmin(payload: JwtPayload): boolean {
  return payload.username === env.ADMIN_USERNAME.toLowerCase();
}

// ── Internal ──────────────────────────────────────────────────────────────────

async function signToken(userId: string, username: string): Promise<LoginResponse> {
  const secret = await getJwtSecret();
  const key = new TextEncoder().encode(secret);
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 86400; // 24 hours

  const token = await new SignJWT({ username })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .sign(key);

  const expiresAt = new Date(exp * 1000).toISOString();
  return { token, expiresAt };
}
