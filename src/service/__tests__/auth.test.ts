import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

// Mock secrets module — avoids real SSM calls and module-level cache issues
vi.mock("../../config/secrets", () => ({
  getJwtSecret: vi.fn().mockResolvedValue("test-secret-at-least-32-chars-long!!"),
}));

const s3Mock = mockClient(S3Client);

import { login, verifyToken, changePassword, createUser } from "../auth";
import {
  InvalidCredentialsError,
  UnauthorizedError,
  ValidationError,
  UsernameTakenError,
} from "../errors";
import bcrypt from "bcryptjs";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function makeUserProfile(username: string, password: string) {
  const passwordHash = await bcrypt.hash(password, 4); // low cost for tests
  return {
    userId: "00000000-0000-0000-0000-000000000001",
    username,
    passwordHash,
    createdAt: new Date().toISOString(),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("login()", () => {
  beforeEach(() => {
    s3Mock.reset();
  });

  it("returns token and expiresAt on valid credentials", async () => {
    const profile = await makeUserProfile("peter", "correct-password");
    const usersByName = { peter: profile.userId };

    s3Mock
      .on(GetObjectCommand, { Key: "auth/users-by-name.json" })
      .resolves({ Body: { transformToString: async () => JSON.stringify(usersByName) } as never, ETag: '"etag1"' });

    s3Mock
      .on(GetObjectCommand, { Key: `users/${profile.userId}/profile.json` })
      .resolves({ Body: { transformToString: async () => JSON.stringify(profile) } as never, ETag: '"etag2"' });

    const result = await login("peter", "correct-password");

    expect(result.token).toBeTruthy();
    expect(result.expiresAt).toBeTruthy();

    // Verify JWT exp = iat + 86400
    const [, payloadB64] = result.token.split(".");
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
    expect(payload.exp - payload.iat).toBe(86400);
  });

  it("throws InvalidCredentialsError for wrong password", async () => {
    const profile = await makeUserProfile("peter", "correct-password");
    const usersByName = { peter: profile.userId };

    s3Mock
      .on(GetObjectCommand, { Key: "auth/users-by-name.json" })
      .resolves({ Body: { transformToString: async () => JSON.stringify(usersByName) } as never, ETag: '"etag1"' });

    s3Mock
      .on(GetObjectCommand, { Key: `users/${profile.userId}/profile.json` })
      .resolves({ Body: { transformToString: async () => JSON.stringify(profile) } as never, ETag: '"etag2"' });

    await expect(login("peter", "wrong-password")).rejects.toThrow(InvalidCredentialsError);
  });

  it("throws InvalidCredentialsError for unknown username (same error type and message)", async () => {
    s3Mock
      .on(GetObjectCommand, { Key: "auth/users-by-name.json" })
      .resolves({ Body: { transformToString: async () => JSON.stringify({}) } as never, ETag: '"etag1"' });

    const error = await login("nobody", "password").catch((e) => e);
    expect(error).toBeInstanceOf(InvalidCredentialsError);
    expect(error.message).toBe(new InvalidCredentialsError().message);
  });
});

describe("verifyToken()", () => {
  beforeEach(() => {
    s3Mock.reset();
  });

  it("returns decoded payload for a valid token", async () => {
    const profile = await makeUserProfile("peter", "pw");

    s3Mock
      .on(GetObjectCommand)
      .resolves({ Body: { transformToString: async () => JSON.stringify({ peter: profile.userId }) } as never, ETag: '"e"' });
    s3Mock
      .on(GetObjectCommand, { Key: `users/${profile.userId}/profile.json` })
      .resolves({ Body: { transformToString: async () => JSON.stringify(profile) } as never, ETag: '"e2"' });

    const { token } = await login("peter", "pw");
    const decoded = await verifyToken(token);
    expect(decoded.sub).toBe(profile.userId);
    expect(decoded.username).toBe("peter");
  });

  it("throws UnauthorizedError for malformed token", async () => {
    await expect(verifyToken("not.a.token")).rejects.toThrow(UnauthorizedError);
  });
});

describe("changePassword()", () => {
  beforeEach(() => {
    s3Mock.reset();
  });

  it("succeeds with correct current password", async () => {
    const profile = await makeUserProfile("peter", "old-password");

    s3Mock
      .on(GetObjectCommand, { Key: `users/${profile.userId}/profile.json` })
      .resolves({ Body: { transformToString: async () => JSON.stringify(profile) } as never, ETag: '"e"' });
    s3Mock.on(PutObjectCommand).resolves({});

    await expect(changePassword(profile.userId, "old-password", "new-password-123")).resolves.toBeUndefined();
  });

  it("throws InvalidCredentialsError for wrong current password", async () => {
    const profile = await makeUserProfile("peter", "old-password");

    s3Mock
      .on(GetObjectCommand, { Key: `users/${profile.userId}/profile.json` })
      .resolves({ Body: { transformToString: async () => JSON.stringify(profile) } as never, ETag: '"e"' });

    await expect(changePassword(profile.userId, "wrong-password", "new-password-123")).rejects.toThrow(InvalidCredentialsError);
  });

  it("throws ValidationError when new password equals current", async () => {
    await expect(changePassword("any-user-id", "same-password", "same-password")).rejects.toThrow(ValidationError);
  });
});

describe("createUser()", () => {
  beforeEach(() => {
    s3Mock.reset();
  });

  it("creates a new user and returns userId", async () => {
    s3Mock
      .on(GetObjectCommand, { Key: "auth/users-by-name.json" })
      .rejects({ name: "NoSuchKey" });
    s3Mock.on(PutObjectCommand).resolves({});

    const result = await createUser({ username: "newuser", password: "password123" });
    expect(result.userId).toBeTruthy();
  });

  it("throws UsernameTakenError if username exists", async () => {
    const profile = await makeUserProfile("existinguser", "pw");
    const usersByName = { existinguser: profile.userId };

    s3Mock
      .on(GetObjectCommand, { Key: "auth/users-by-name.json" })
      .resolves({ Body: { transformToString: async () => JSON.stringify(usersByName) } as never, ETag: '"e"' });
    s3Mock
      .on(GetObjectCommand, { Key: `users/${profile.userId}/profile.json` })
      .resolves({ Body: { transformToString: async () => JSON.stringify(profile) } as never, ETag: '"e2"' });

    await expect(createUser({ username: "existinguser", password: "pw" })).rejects.toThrow(UsernameTakenError);
  });
});
