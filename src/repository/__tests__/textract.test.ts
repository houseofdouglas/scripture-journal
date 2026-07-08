import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import {
  TextractClient,
  StartDocumentAnalysisCommand,
  GetDocumentAnalysisCommand,
} from "@aws-sdk/client-textract";
import { analyzeDocumentLayout, TEXTRACT_REGION } from "../textract";
import { ExtractionFailedError, ExtractionTimeoutError } from "../errors";

const textractMock = mockClient(TextractClient);

describe("TEXTRACT_REGION", () => {
  it("is us-east-1 (Textract requires the same region as the S3 object)", () => {
    expect(TEXTRACT_REGION).toBe("us-east-1");
  });
});

describe("analyzeDocumentLayout()", () => {
  beforeEach(() => {
    textractMock.reset();
    vi.useRealTimers();
  });

  it("starts a Layout job and returns blocks + pageCount on success", async () => {
    textractMock.on(StartDocumentAnalysisCommand).resolves({ JobId: "job-1" });
    textractMock
      .on(GetDocumentAnalysisCommand)
      .resolvesOnce({ JobStatus: "SUCCEEDED" })
      .resolvesOnce({
        JobStatus: "SUCCEEDED",
        Blocks: [{ BlockType: "LAYOUT_TEXT", Id: "b1" }],
        DocumentMetadata: { Pages: 3 },
      });

    const result = await analyzeDocumentLayout("my-bucket", "tmp/extract/a.pdf");

    expect(result.pageCount).toBe(3);
    expect(result.blocks).toHaveLength(1);
    const startCall = textractMock.commandCalls(StartDocumentAnalysisCommand)[0]!;
    expect(startCall.args[0].input.DocumentLocation).toEqual({
      S3Object: { Bucket: "my-bucket", Name: "tmp/extract/a.pdf" },
    });
    expect(startCall.args[0].input.FeatureTypes).toEqual(["LAYOUT"]);
  });

  it("paginates across multiple NextToken pages", async () => {
    textractMock.on(StartDocumentAnalysisCommand).resolves({ JobId: "job-2" });
    textractMock
      .on(GetDocumentAnalysisCommand)
      .resolvesOnce({ JobStatus: "SUCCEEDED" }) // status poll
      .resolvesOnce({
        JobStatus: "SUCCEEDED",
        Blocks: [{ BlockType: "LAYOUT_TEXT", Id: "b1" }],
        DocumentMetadata: { Pages: 2 },
        NextToken: "page2",
      })
      .resolvesOnce({
        JobStatus: "SUCCEEDED",
        Blocks: [{ BlockType: "LAYOUT_TEXT", Id: "b2" }],
        DocumentMetadata: { Pages: 2 },
      });

    const result = await analyzeDocumentLayout("my-bucket", "tmp/extract/a.pdf");

    expect(result.blocks.map((b) => b.Id)).toEqual(["b1", "b2"]);
  });

  it("polls while IN_PROGRESS then succeeds", async () => {
    textractMock.on(StartDocumentAnalysisCommand).resolves({ JobId: "job-3" });
    textractMock
      .on(GetDocumentAnalysisCommand)
      .resolvesOnce({ JobStatus: "IN_PROGRESS" })
      .resolvesOnce({ JobStatus: "SUCCEEDED" })
      .resolvesOnce({ JobStatus: "SUCCEEDED", Blocks: [], DocumentMetadata: { Pages: 1 } });

    const result = await analyzeDocumentLayout("my-bucket", "tmp/extract/a.pdf");
    expect(result.pageCount).toBe(1);
  });

  it("throws ExtractionFailedError when the job reports FAILED", async () => {
    textractMock.on(StartDocumentAnalysisCommand).resolves({ JobId: "job-4" });
    textractMock.on(GetDocumentAnalysisCommand).resolves({ JobStatus: "FAILED" });

    await expect(analyzeDocumentLayout("my-bucket", "tmp/extract/a.pdf")).rejects.toThrow(
      ExtractionFailedError
    );
  });

  it("retries throttling errors during polling then succeeds", async () => {
    textractMock.on(StartDocumentAnalysisCommand).resolves({ JobId: "job-5" });
    textractMock
      .on(GetDocumentAnalysisCommand)
      .rejectsOnce({ name: "ThrottlingException" })
      .rejectsOnce({ name: "ProvisionedThroughputExceededException" })
      .resolvesOnce({ JobStatus: "SUCCEEDED" })
      .resolvesOnce({ JobStatus: "SUCCEEDED", Blocks: [], DocumentMetadata: { Pages: 1 } });

    const result = await analyzeDocumentLayout("my-bucket", "tmp/extract/a.pdf");
    expect(result.pageCount).toBe(1);
  });

  it("throws ExtractionTimeoutError when still IN_PROGRESS past the time budget", async () => {
    vi.useFakeTimers();
    textractMock.on(StartDocumentAnalysisCommand).resolves({ JobId: "job-6" });
    textractMock.on(GetDocumentAnalysisCommand).resolves({ JobStatus: "IN_PROGRESS" });

    const promise = analyzeDocumentLayout("my-bucket", "tmp/extract/a.pdf");
    const assertion = expect(promise).rejects.toThrow(ExtractionTimeoutError);
    await vi.advanceTimersByTimeAsync(80_000);
    await assertion;
    vi.useRealTimers();
  });
});
