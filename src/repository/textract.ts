import {
  TextractClient,
  StartDocumentAnalysisCommand,
  GetDocumentAnalysisCommand,
  type Block,
} from "@aws-sdk/client-textract";
import { ExtractionFailedError, ExtractionTimeoutError } from "./errors";

// Textract requires the same region as the S3 object being analyzed. Exported
// so tests can assert on it directly (aws-sdk-client-mock intercepts at the
// .send() layer and doesn't expose client-construction args).
export const TEXTRACT_REGION = "us-east-1";

const textract = new TextractClient({ region: TEXTRACT_REGION });

const POLL_INTERVAL_MS = 2_000;
const TIME_BUDGET_MS = 75_000;
const MAX_THROTTLE_RETRIES = 3;

export interface DocumentAnalysisResult {
  blocks: Block[];
  pageCount: number;
}

/**
 * Runs a Textract Layout analysis job to completion: starts the job, polls
 * until it succeeds or fails, paginating all result blocks, within a 75s
 * time budget. Throttling errors are retried with backoff (up to 3×)
 * without consuming the overall budget.
 *
 * Throws `ExtractionFailedError` if the job reports `FAILED`, or
 * `ExtractionTimeoutError` if it is still `IN_PROGRESS` when the budget
 * elapses.
 */
export async function analyzeDocumentLayout(
  bucket: string,
  key: string
): Promise<DocumentAnalysisResult> {
  const jobId = await startJob(bucket, key);
  const deadline = Date.now() + TIME_BUDGET_MS;

  while (Date.now() < deadline) {
    const status = await getStatusWithRetry(jobId);
    if (status === "SUCCEEDED") {
      return collectAllBlocks(jobId);
    }
    if (status === "FAILED") {
      throw new ExtractionFailedError(`Textract job "${jobId}" failed`);
    }
    // IN_PROGRESS — wait and poll again
    await sleep(POLL_INTERVAL_MS);
  }

  throw new ExtractionTimeoutError(jobId, TIME_BUDGET_MS);
}

async function startJob(bucket: string, key: string): Promise<string> {
  const response = await textract.send(
    new StartDocumentAnalysisCommand({
      DocumentLocation: { S3Object: { Bucket: bucket, Name: key } },
      FeatureTypes: ["LAYOUT"],
    })
  );
  if (!response.JobId) {
    throw new ExtractionFailedError("Textract did not return a JobId");
  }
  return response.JobId;
}

/** First page's JobStatus, retrying transient throttling errors with backoff. */
async function getStatusWithRetry(jobId: string): Promise<string> {
  for (let attempt = 0; attempt <= MAX_THROTTLE_RETRIES; attempt++) {
    try {
      const response = await textract.send(
        new GetDocumentAnalysisCommand({ JobId: jobId, MaxResults: 1 })
      );
      return response.JobStatus ?? "IN_PROGRESS";
    } catch (err: unknown) {
      if (isThrottlingError(err) && attempt < MAX_THROTTLE_RETRIES) {
        await sleep(200 * 2 ** attempt);
        continue;
      }
      throw err;
    }
  }
  throw new ExtractionFailedError(`Textract polling for job "${jobId}" exhausted retries`);
}

/** Paginates GetDocumentAnalysis across all NextTokens once a job has SUCCEEDED. */
async function collectAllBlocks(jobId: string): Promise<DocumentAnalysisResult> {
  const blocks: Block[] = [];
  let pageCount = 0;
  let nextToken: string | undefined;

  do {
    const response = await textract.send(
      new GetDocumentAnalysisCommand({ JobId: jobId, NextToken: nextToken })
    );
    blocks.push(...(response.Blocks ?? []));
    pageCount = response.DocumentMetadata?.Pages ?? pageCount;
    nextToken = response.NextToken;
  } while (nextToken);

  return { blocks, pageCount };
}

function isThrottlingError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const name = (err as { name?: string }).name;
  return name === "ProvisionedThroughputExceededException" || name === "ThrottlingException";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
