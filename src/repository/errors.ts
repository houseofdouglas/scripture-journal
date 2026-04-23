/**
 * Thrown by `conditionalWrite()` after all retries are exhausted (3× 412
 * Precondition Failed from S3). Callers should map this to a 409 response.
 */
export class WriteConflictError extends Error {
  constructor(key: string) {
    super(`Write conflict on S3 key "${key}": all retries exhausted`);
    this.name = "WriteConflictError";
  }
}
