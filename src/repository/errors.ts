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

/**
 * Thrown when a Textract document-analysis job completes with status
 * `FAILED`, or succeeds but yields no usable text. Callers should map this
 * to a 502 response so the client falls back to local extraction.
 */
export class ExtractionFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractionFailedError";
  }
}

/**
 * Thrown when a Textract document-analysis job is still `IN_PROGRESS` after
 * the polling time budget elapses. Callers should map this to a 502
 * response so the client falls back to local extraction.
 */
export class ExtractionTimeoutError extends Error {
  constructor(jobId: string, budgetMs: number) {
    super(`Textract job "${jobId}" did not complete within ${budgetMs}ms`);
    this.name = "ExtractionTimeoutError";
  }
}
