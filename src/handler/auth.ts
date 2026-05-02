import type { Hono } from "hono";
import type { AppEnv } from "./app";
import { LoginRequestSchema, ChangePasswordRequestSchema, CreateUserRequestSchema } from "../types";
import { login, changePassword, createUser, isAdmin } from "../service/auth";
import {
  InvalidCredentialsError,
  ValidationError,
  UsernameTakenError,
  ForbiddenError,
} from "../service/errors";
import { ZodError } from "zod";

export function registerAuthRoutes(app: Hono<AppEnv>): void {
  // ── POST /auth/login ────────────────────────────────────────────────────────
  app.post("/auth/login", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "VALIDATION_ERROR", message: "Request body must be valid JSON" }, 422);
    }

    const parsed = LoginRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          error: "VALIDATION_ERROR",
          message: "Invalid request body",
          fields: formatZodErrors(parsed.error),
        },
        422
      );
    }

    const { username, password } = parsed.data;

    try {
      const result = await login(username, password);
      return c.json(result, 200);
    } catch (err) {
      if (err instanceof InvalidCredentialsError) {
        return c.json({ error: "INVALID_CREDENTIALS", message: "Invalid username or password" }, 401);
      }
      throw err;
    }
  });

  // ── POST /auth/password ─────────────────────────────────────────────────────
  app.post("/auth/password", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "VALIDATION_ERROR", message: "Request body must be valid JSON" }, 422);
    }

    const parsed = ChangePasswordRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          error: "VALIDATION_ERROR",
          message: "Invalid request body",
          fields: formatZodErrors(parsed.error),
        },
        422
      );
    }

    const { currentPassword, newPassword } = parsed.data;
    const { sub: userId } = c.get("jwtPayload");

    try {
      await changePassword(userId, currentPassword, newPassword);
      return c.json({ message: "Password updated" }, 200);
    } catch (err) {
      if (err instanceof InvalidCredentialsError) {
        return c.json(
          { error: "WRONG_CURRENT_PASSWORD", message: "Current password is incorrect" },
          401
        );
      }
      if (err instanceof ValidationError) {
        return c.json(
          { error: "VALIDATION_ERROR", message: "Validation failed", fields: err.fields },
          422
        );
      }
      throw err;
    }
  });

  // ── POST /admin/users ───────────────────────────────────────────────────────
  app.post("/admin/users", async (c) => {
    const payload = c.get("jwtPayload");
    if (!isAdmin(payload)) {
      return c.json({ error: "FORBIDDEN", message: "Admin access required" }, 403);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "VALIDATION_ERROR", message: "Request body must be valid JSON" }, 422);
    }

    const parsed = CreateUserRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          error: "VALIDATION_ERROR",
          message: "Invalid request body",
          fields: formatZodErrors(parsed.error),
        },
        422
      );
    }

    try {
      const result = await createUser(parsed.data);
      return c.json(result, 201);
    } catch (err) {
      if (err instanceof UsernameTakenError) {
        return c.json(
          {
            error: "USERNAME_TAKEN",
            message: err.message,
            fields: { username: "This username is already taken" },
          },
          409
        );
      }
      throw err;
    }
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatZodErrors(error: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.errors) {
    const key = issue.path.join(".") || "_root";
    fields[key] = issue.message;
  }
  return fields;
}
