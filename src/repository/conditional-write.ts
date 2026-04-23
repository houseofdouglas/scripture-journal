import { getObject, putObject } from "./s3-client";
import { WriteConflictError } from "./errors";

const MAX_RETRIES = 3;
const BACKOFF_MS = [100, 200, 400] as const;

/**
 * Atomically read-modify-write a JSON object in S3 using ETag-based
 * optimistic concurrency control.
 *
 * Algorithm:
 *   1. GET the current object (→ `data`, `etag`). If the key does not exist,
 *      `data` is `null` and we use `If-None-Match: *` to guard the first write.
 *   2. Call `transform(data)` to produce the new value.
 *   3. PUT with `If-Match: <etag>` (or `If-None-Match: *` for new keys).
 *   4. On 412 Precondition Failed, wait `BACKOFF_MS[attempt]` ms and retry
 *      from step 1.
 *   5. After `MAX_RETRIES` consecutive 412s, throw `WriteConflictError`.
 *
 * @param key       S3 object key
 * @param transform Pure function: receives current data (or `null`) → returns new data
 * @returns         The value returned by `transform` after a successful write
 */
export async function conditionalWrite<T>(
  key: string,
  transform: (current: T | null) => T
): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // Step 1: read current state
    const existing = await getObject<T>(key);
    const current = existing?.data ?? null;
    const etag = existing?.etag;

    // Step 2: compute new value
    const next = transform(current);

    // Step 3: write with conditional header
    try {
      if (etag) {
        await putObject(key, next, { ifMatch: etag });
      } else {
        await putObject(key, next, { ifNoneMatch: "*" });
      }
      return next;
    } catch (err: unknown) {
      if (isPreconditionFailed(err) && attempt < MAX_RETRIES) {
        await sleep(BACKOFF_MS[attempt]);
        continue;
      }
      if (isPreconditionFailed(err)) {
        throw new WriteConflictError(key);
      }
      throw err;
    }
  }

  // Unreachable — loop above either returns or throws
  throw new WriteConflictError(key);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isPreconditionFailed(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
  return status === 412;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
