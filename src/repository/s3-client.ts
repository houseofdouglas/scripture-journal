import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  type PutObjectCommandInput,
} from "@aws-sdk/client-s3";
import { env } from "../config/env";

export const s3 = new S3Client({ region: process.env.AWS_REGION ?? "us-east-1" });

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GetObjectResult<T> {
  data: T;
  etag: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Fetch a JSON object from S3 and parse it.
 * Returns `null` if the key does not exist (404).
 * Throws on any other error.
 */
export async function getObject<T>(key: string): Promise<GetObjectResult<T> | null> {
  try {
    const response = await s3.send(
      new GetObjectCommand({ Bucket: env.BUCKET_NAME, Key: key })
    );

    const body = await response.Body?.transformToString("utf-8");
    if (!body) {
      throw new Error(`[s3] Empty body for key "${key}"`);
    }

    const etag = response.ETag ?? "";
    return { data: JSON.parse(body) as T, etag };
  } catch (err: unknown) {
    if (isS3NotFound(err)) return null;
    throw err;
  }
}

/**
 * Write a JSON object to S3.
 *
 * @param key       S3 key
 * @param data      Value to serialize as JSON
 * @param ifMatch   If provided, sets `If-Match` header (optimistic concurrency)
 * @param ifNoneMatch  If provided, sets `If-None-Match` header (e.g. "*" to prevent overwrites)
 */
export async function putObject<T>(
  key: string,
  data: T,
  options: { ifMatch?: string; ifNoneMatch?: string } = {}
): Promise<void> {
  const input: PutObjectCommandInput = {
    Bucket: env.BUCKET_NAME,
    Key: key,
    Body: JSON.stringify(data),
    ContentType: "application/json",
  };

  if (options.ifMatch) input.IfMatch = options.ifMatch;
  if (options.ifNoneMatch) input.IfNoneMatch = options.ifNoneMatch;

  await s3.send(new PutObjectCommand(input));
}

/**
 * Check whether a key exists in S3 without fetching the body.
 * Returns the ETag if found, `null` if the key does not exist.
 */
export async function headObject(key: string): Promise<string | null> {
  try {
    const response = await s3.send(
      new HeadObjectCommand({ Bucket: env.BUCKET_NAME, Key: key })
    );
    return response.ETag ?? null;
  } catch (err: unknown) {
    if (isS3NotFound(err)) return null;
    throw err;
  }
}

/**
 * Delete a key from S3. No-ops silently if the key does not exist.
 */
export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: env.BUCKET_NAME, Key: key }));
}

// ── Internal ──────────────────────────────────────────────────────────────────

function isS3NotFound(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { name?: string; $metadata?: { httpStatusCode?: number } }).name;
  const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
  return code === "NoSuchKey" || code === "NotFound" || status === 404;
}
