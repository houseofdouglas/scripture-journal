import type { Hono } from "hono";
import type { AppEnv } from "./app";
import { ImportRequestSchema } from "../types";
import { importArticle } from "../service/article-import";
import { ValidationError } from "../service/errors";
import { ZodError } from "zod";

export function registerArticleRoutes(app: Hono<AppEnv>): void {
  // ── POST /articles/import ───────────────────────────────────────────────────
  app.post("/articles/import", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "VALIDATION_ERROR", message: "Request body must be valid JSON" }, 422);
    }

    const parsed = ImportRequestSchema.safeParse(body);
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
      const result = await importArticle(parsed.data);
      return c.json(result, 200);
    } catch (err) {
      if (err instanceof ValidationError) {
        const firstField = Object.keys(err.fields)[0]!;
        const errorCode = firstField === "url"
          ? deriveUrlErrorCode(err.fields[firstField]!)
          : "VALIDATION_ERROR";
        return c.json(
          {
            error: errorCode,
            message: err.message,
            fields: err.fields,
          },
          422
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

function deriveUrlErrorCode(message: string): string {
  if (message.includes("allowlist") || message.includes("Domain")) return "DOMAIN_NOT_ALLOWED";
  if (message.includes("timed out") || message.includes("Fetch failed")) return "FETCH_FAILED";
  return "VALIDATION_ERROR";
}
