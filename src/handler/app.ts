import { Hono } from "hono";
import { cors } from "hono/cors";
import { env } from "../config/env";
import { verifyToken } from "../service/auth";
import type { JwtPayload } from "../types";
import { UnauthorizedError } from "../service/errors";

// ── Hono context type ─────────────────────────────────────────────────────────

export type AppEnv = {
  Variables: {
    jwtPayload: JwtPayload;
  };
};

// ── App factory ───────────────────────────────────────────────────────────────

export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // CORS — restricted to the CloudFront domain when known, open otherwise.
  // CLOUDFRONT_DOMAIN is empty on the initial deploy and in local dev;
  // updated via `terraform apply -var="cloudfront_domain=..."` after first deploy.
  const corsOrigin = env.CLOUDFRONT_DOMAIN
    ? `https://${env.CLOUDFRONT_DOMAIN}`
    : "*";

  app.use(
    "*",
    cors({
      origin: corsOrigin,
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
      maxAge: 86400,
    })
  );

  // JWT middleware — all routes except POST /auth/login
  app.use("*", async (c, next) => {
    const path = c.req.path;
    const method = c.req.method;

    // Login endpoint is public
    if (method === "POST" && path === "/auth/login") {
      return next();
    }

    const authorization = c.req.header("Authorization");
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;

    if (!token) {
      return c.json({ error: "UNAUTHORIZED", message: "Missing Authorization header" }, 401);
    }

    try {
      const payload = await verifyToken(token);
      c.set("jwtPayload", payload);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return c.json({ error: "UNAUTHORIZED", message: err.message }, 401);
      }
      throw err;
    }

    return next();
  });

  return app;
}
