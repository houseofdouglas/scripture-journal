import type { Hono } from "hono";
import type { AppEnv } from "./app";
import { CreateProjectRequestSchema } from "../types";
import { listProjects, createProject } from "../service/project";
import { ZodError } from "zod";

export function registerProjectRoutes(app: Hono<AppEnv>): void {
  // ── GET /projects ──────────────────────────────────────────────────────────
  app.get("/projects", async (c) => {
    const { sub: userId } = c.get("jwtPayload");
    const projects = await listProjects(userId);
    return c.json({ projects });
  });

  // ── POST /projects ─────────────────────────────────────────────────────────
  app.post("/projects", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "VALIDATION_ERROR", message: "Request body must be valid JSON" }, 422);
    }

    const parsed = CreateProjectRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "VALIDATION_ERROR", message: "Invalid request", fields: formatZodErrors(parsed.error) },
        422
      );
    }

    const { sub: userId } = c.get("jwtPayload");
    const project = await createProject(userId, parsed.data.name);
    return c.json(project, 201);
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
