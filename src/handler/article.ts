import type { Hono } from "hono";
import type { AppEnv } from "./app";
import { ImportRequestSchema } from "../types";
import { importArticle, archiveArticle, unarchiveArticle } from "../service/article-import";
import { ValidationError } from "../service/errors";
import { WriteConflictError } from "../repository/errors";
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

  // ── POST /articles/:articleId/archive ───────────────────────────────────────
  app.post("/articles/:articleId/archive", async (c) => {
    const articleId = c.req.param("articleId");
    try {
      const result = await archiveArticle(articleId);
      if (!result) {
        return c.json({ error: "NOT_FOUND", message: "Article not found in index" }, 404);
      }
      return c.json({ data: result }, 200);
    } catch (err) {
      if (err instanceof WriteConflictError) {
        return c.json(
          { error: "WRITE_CONFLICT", message: "Could not update the article index. Please try again." },
          409
        );
      }
      throw err;
    }
  });

  // ── POST /articles/:articleId/unarchive ─────────────────────────────────────
  app.post("/articles/:articleId/unarchive", async (c) => {
    const articleId = c.req.param("articleId");
    try {
      const result = await unarchiveArticle(articleId);
      if (!result) {
        return c.json({ error: "NOT_FOUND", message: "Article not found in index" }, 404);
      }
      return c.json({ data: result }, 200);
    } catch (err) {
      if (err instanceof WriteConflictError) {
        return c.json(
          { error: "WRITE_CONFLICT", message: "Could not update the article index. Please try again." },
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

function deriveUrlErrorCode(message: string): string {
  if (message.includes("allowlist") || message.includes("Domain")) return "DOMAIN_NOT_ALLOWED";
  if (message.includes("timed out") || message.includes("Fetch failed")) return "FETCH_FAILED";
  return "VALIDATION_ERROR";
}
