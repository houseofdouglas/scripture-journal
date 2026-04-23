import type { Hono } from "hono";
import type { AppEnv } from "./app";
import { AnnotateRequestSchema } from "../types";
import { annotate } from "../service/annotation";
import { ValidationError } from "../service/errors";
import { WriteConflictError } from "../repository/errors";
import { ZodError } from "zod";

export function registerAnnotationRoutes(app: Hono<AppEnv>): void {
  // ── POST /entries/annotate ──────────────────────────────────────────────────
  app.post("/entries/annotate", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "VALIDATION_ERROR", message: "Request body must be valid JSON" }, 422);
    }

    const parsed = AnnotateRequestSchema.safeParse(body);
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

    const { sub: userId } = c.get("jwtPayload");

    try {
      const result = await annotate(userId, parsed.data);
      return c.json(result, 200);
    } catch (err) {
      if (err instanceof ValidationError) {
        return c.json(
          { error: "VALIDATION_ERROR", message: "Validation failed", fields: err.fields },
          422
        );
      }
      if (err instanceof WriteConflictError) {
        return c.json(
          { error: "WRITE_CONFLICT", message: "Could not save your note. Please try again." },
          409
        );
      }
      throw err;
    }
  });
}

function formatZodErrors(error: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.errors) {
    const key = issue.path.join(".") || "_root";
    fields[key] = issue.message;
  }
  return fields;
}
