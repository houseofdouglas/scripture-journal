/**
 * Local development server.
 *
 * Runs the Hono app on Node.js (no Lambda emulation needed) and also serves
 * /content/* and /users/* by proxying straight to S3 — the same data that
 * CloudFront fronts in production.
 *
 * Usage:
 *   npm run dev:api          # start this server
 *   npm run dev              # start this + Vite together (recommended)
 *
 * Required env vars — copy .env.local.example → .env.local and fill in:
 *   BUCKET_NAME, ENV, ADMIN_USERNAME, CLOUDFRONT_DOMAIN
 *   JWT_SECRET (direct value — skips SSM in local dev)
 */

import "dotenv/config"; // load .env.local before anything else
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";

// Import the Hono app factory and route registrations (mirrors lambda.ts)
import { createApp } from "../src/handler/app";
import { registerAuthRoutes } from "../src/handler/auth";
import { registerArticleRoutes } from "../src/handler/article";
import { registerAnnotationRoutes } from "../src/handler/annotation";

const apiApp = createApp();
registerAuthRoutes(apiApp);
registerArticleRoutes(apiApp);
registerAnnotationRoutes(apiApp);

const PORT = Number(process.env.DEV_API_PORT ?? 4000);
const BUCKET = process.env.BUCKET_NAME!;
const AWS_REGION = process.env.AWS_REGION ?? "us-east-1";

const s3 = new S3Client({ region: AWS_REGION });

// ── S3 content proxy ─────────────────────────────────────────────────────────

const proxy = new Hono();

/**
 * Proxy /content/* and /users/* directly from S3.
 * In production these are served by CloudFront; locally we hit S3 directly.
 */
async function s3Proxy(key: string): Promise<Response> {
  try {
    const result = await s3.send(
      new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    );

    const body = result.Body as Readable;
    const contentType = result.ContentType ?? "application/json";

    // Convert Node.js Readable to Web ReadableStream
    const stream = new ReadableStream({
      start(controller) {
        body.on("data", (chunk: Buffer) => controller.enqueue(chunk));
        body.on("end", () => controller.close());
        body.on("error", (err) => controller.error(err));
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (err: unknown) {
    const code = (err as { name?: string })?.name;
    if (code === "NoSuchKey" || code === "NotFound") {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    console.error("[s3-proxy] error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

proxy.get("/content/*", async (c) => {
  // c.req.path = "/content/scripture/manifest.json"
  // S3 key   = "content/scripture/manifest.json"
  const key = c.req.path.slice(1);
  return s3Proxy(key);
});

proxy.get("/users/*", async (c) => {
  const key = c.req.path.slice(1);
  return s3Proxy(key);
});

// Mount the existing API app (handles all /auth/*, /entries/*, /articles/* routes)
proxy.route("/", apiApp);

// ── Start ─────────────────────────────────────────────────────────────────────

serve({ fetch: proxy.fetch, port: PORT }, (info) => {
  console.log(`\n  🚀  API dev server running on http://localhost:${info.port}`);
  console.log(`  📦  S3 bucket: ${BUCKET}`);
  console.log(`  🌍  Region:    ${AWS_REGION}\n`);
});
