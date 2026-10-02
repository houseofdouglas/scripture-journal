import crypto from "crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "./s3-client";
import { env } from "../config/env";
import { assetKey, type AssetExt } from "../types/article";

/** Assets are content-addressed and write-once, so they may be cached forever. */
const ASSET_CACHE_CONTROL = "public, max-age=31536000, immutable";

/** Lowercase hex sha256 of raw bytes. */
export function sha256Hex(bytes: Uint8Array): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

/**
 * Store an asset at `content/assets/<sha256>.<ext>` and return its key.
 *
 * Write-once: the PUT carries `If-None-Match: *`. A 412 means an object with
 * this content hash already exists — identical bytes by construction — so it
 * is treated as success. Any other error propagates.
 */
export async function putAsset(
  bytes: Uint8Array,
  ext: AssetExt,
  contentType: string
): Promise<string> {
  const key = assetKey(sha256Hex(bytes), ext);
  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: env.BUCKET_NAME,
        Key: key,
        Body: bytes,
        ContentType: contentType,
        CacheControl: ASSET_CACHE_CONTROL,
        IfNoneMatch: "*",
      })
    );
  } catch (err: unknown) {
    if (!isPreconditionFailed(err)) throw err;
  }
  return key;
}

// ── Internal ──────────────────────────────────────────────────────────────────

function isPreconditionFailed(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
  return status === 412;
}
