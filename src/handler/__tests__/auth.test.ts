import { describe, it, expect, vi, beforeEach } from "vitest";


// Mock the auth service
vi.mock("../../service/auth", () => ({
  login: vi.fn(),
  verifyToken: vi.fn(),
  changePassword: vi.fn(),
  createUser: vi.fn(),
  isAdmin: vi.fn(),
}));

import * as authService from "../../service/auth";
import {
  InvalidCredentialsError,
  UnauthorizedError,
  ValidationError,
  UsernameTakenError,
} from "../../service/errors";
import { createApp } from "../app";
import { registerAuthRoutes } from "../auth";

const mockLogin = vi.mocked(authService.login);
const mockVerifyToken = vi.mocked(authService.verifyToken);
const mockChangePassword = vi.mocked(authService.changePassword);
const mockCreateUser = vi.mocked(authService.createUser);
const mockIsAdmin = vi.mocked(authService.isAdmin);

const FAKE_PAYLOAD = { sub: "user-uuid", username: "peter", iat: 1000000, exp: 9999999 };

function buildApp() {
  const app = createApp();
  registerAuthRoutes(app);
  return app;
}

async function req(
  app: ReturnType<typeof buildApp>,
  method: string,
  path: string,
  body?: unknown,
  token?: string
) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  return app.request(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("POST /auth/login", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 with token on valid credentials", async () => {
    mockLogin.mockResolvedValue({ token: "jwt-token", expiresAt: "2026-04-23T00:00:00Z" });

    const app = buildApp();
    const res = await req(app, "POST", "/auth/login", { username: "peter", password: "pw" });

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.token).toBe("jwt-token");
  });

  it("returns 401 on invalid credentials", async () => {
    mockLogin.mockRejectedValue(new InvalidCredentialsError());

    const app = buildApp();
    const res = await req(app, "POST", "/auth/login", { username: "peter", password: "wrong" });

    expect(res.status).toBe(401);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe("INVALID_CREDENTIALS");
  });

  it("returns 422 on Zod validation failure", async () => {
    const app = buildApp();
    const res = await req(app, "POST", "/auth/login", { username: "" });

    expect(res.status).toBe(422);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe("VALIDATION_ERROR");
  });

  it("returns 401 without JWT for protected routes", async () => {
    const app = buildApp();
    const res = await req(app, "POST", "/auth/password", { currentPassword: "a", newPassword: "b" });

    expect(res.status).toBe(401);
  });
});

describe("POST /auth/password", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 on successful password change", async () => {
    mockVerifyToken.mockResolvedValue(FAKE_PAYLOAD);
    mockChangePassword.mockResolvedValue(undefined);

    const app = buildApp();
    const res = await req(
      app,
      "POST",
      "/auth/password",
      { currentPassword: "old", newPassword: "newpassword123" },
      "valid-token"
    );

    expect(res.status).toBe(200);
  });

  it("returns 401 on wrong current password", async () => {
    mockVerifyToken.mockResolvedValue(FAKE_PAYLOAD);
    mockChangePassword.mockRejectedValue(new InvalidCredentialsError());

    const app = buildApp();
    const res = await req(
      app,
      "POST",
      "/auth/password",
      { currentPassword: "wrong", newPassword: "newpassword123" },
      "valid-token"
    );

    expect(res.status).toBe(401);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe("WRONG_CURRENT_PASSWORD");
  });

  it("returns 422 on validation error (new === current)", async () => {
    mockVerifyToken.mockResolvedValue(FAKE_PAYLOAD);
    mockChangePassword.mockRejectedValue(new ValidationError({ newPassword: "Must differ" }));

    const app = buildApp();
    const res = await req(
      app,
      "POST",
      "/auth/password",
      { currentPassword: "same", newPassword: "same_long_enough" },
      "valid-token"
    );

    expect(res.status).toBe(422);
  });
});

describe("POST /admin/users", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 for non-admin users", async () => {
    mockVerifyToken.mockResolvedValue(FAKE_PAYLOAD);
    mockIsAdmin.mockReturnValue(false);

    const app = buildApp();
    const res = await req(
      app,
      "POST",
      "/admin/users",
      { username: "newuser", password: "password123" },
      "non-admin-token"
    );

    expect(res.status).toBe(403);
  });

  it("returns 201 for admin creating a new user", async () => {
    mockVerifyToken.mockResolvedValue({ ...FAKE_PAYLOAD, username: "peter" });
    mockIsAdmin.mockReturnValue(true);
    mockCreateUser.mockResolvedValue({ userId: "new-user-uuid" });

    const app = buildApp();
    const res = await req(
      app,
      "POST",
      "/admin/users",
      { username: "newuser", password: "password123" },
      "admin-token"
    );

    expect(res.status).toBe(201);
    const body = await res.json() as Record<string, unknown>;
    expect(body.userId).toBe("new-user-uuid");
  });

  it("returns 422 when username already taken", async () => {
    mockVerifyToken.mockResolvedValue({ ...FAKE_PAYLOAD, username: "peter" });
    mockIsAdmin.mockReturnValue(true);
    mockCreateUser.mockRejectedValue(new UsernameTakenError("takenuser"));

    const app = buildApp();
    const res = await req(
      app,
      "POST",
      "/admin/users",
      { username: "takenuser", password: "password123" },
      "admin-token"
    );

    expect(res.status).toBe(422);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe("USERNAME_TAKEN");
  });
});
