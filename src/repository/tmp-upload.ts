import crypto from "crypto";
import {
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3 } from "./s3-client";
import { env } from "../config/env";
import { buildExtractTmpKey } from "../types";

const UPLOAD_URL_EXPIRY_SECONDS = 5 * 60;

/**
 * Generate a presigned S3 PUT URL for a fresh `tmp/extract/<uuid>.pdf` key,
 * scoped to `Content-Type: application/pdf` so the presigned URL cannot be
 * used to upload arbitrary content types. Expires after 5 minutes.
 */
export async function createExtractUploadUrl(): Promise<{ uploadUrl: string; key: string }> {
  const key = buildExtractTmpKey(crypto.randomUUID());
  const command = new PutObjectCommand({
    Bucket: env.BUCKET_NAME,
    Key: key,
    ContentType: "application/pdf",
  });
  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: UPLOAD_URL_EXPIRY_SECONDS });
  return { uploadUrl, key };
}

/**
 * Returns the object's size in bytes, or `null` if it does not exist.
 */
export async function headTmpObject(key: string): Promise<number | null> {
  try {
    const response = await s3.send(new HeadObjectCommand({ Bucket: env.BUCKET_NAME, Key: key }));
    return response.ContentLength ?? 0;
  } catch (err: unknown) {
    if (isS3NotFound(err)) return null;
    throw err;
  }
}

/**
 * Ranged read of the first `bytes` bytes of an object — used to check PDF
 * magic bytes (`%PDF-`) without downloading the whole file.
 */
export async function readTmpObjectPrefix(key: string, bytes: number): Promise<Buffer> {
  const response = await s3.send(
    new GetObjectCommand({ Bucket: env.BUCKET_NAME, Key: key, Range: `bytes=0-${bytes - 1}` })
  );
  const body = await response.Body?.transformToByteArray();
  return Buffer.from(body ?? new Uint8Array());
}

/**
 * Best-effort delete of a tmp object. Failures are swallowed (logged by the
 * caller if desired) — the S3 lifecycle rule on `tmp/` is the backstop.
 */
export async function deleteTmpObject(key: string): Promise<void> {
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: env.BUCKET_NAME, Key: key }));
  } catch {
    // Swallowed — the tmp/ lifecycle rule expires the object within a day regardless.
  }
}

function isS3NotFound(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { name?: string; $metadata?: { httpStatusCode?: number } }).name;
  const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
  return code === "NoSuchKey" || code === "NotFound" || status === 404;
}
