import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { S3Client, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

// getSignedUrl signs locally (never calls .send()), so aws-sdk-client-mock
// can't intercept it — and CI runs unit tests before AWS credentials are
// configured (see deploy.yml), so real credential resolution must never be
// exercised here. Mock the presigner module directly instead.
const mockGetSignedUrl = vi.fn();
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: (...args: unknown[]) => mockGetSignedUrl(...args),
}));

import {
  createExtractUploadUrl,
  headTmpObject,
  readTmpObjectPrefix,
  deleteTmpObject,
} from "../tmp-upload";

const s3Mock = mockClient(S3Client);

describe("createExtractUploadUrl()", () => {
  beforeEach(() => {
    s3Mock.reset();
    mockGetSignedUrl.mockReset();
  });

  it("returns a presigned URL and a key matching tmp/extract/<uuid>.pdf", async () => {
    mockGetSignedUrl.mockResolvedValue("https://bucket.s3.amazonaws.com/tmp/extract/x?sig=abc");

    const result = await createExtractUploadUrl();

    expect(result.uploadUrl).toBe("https://bucket.s3.amazonaws.com/tmp/extract/x?sig=abc");
    expect(result.key).toMatch(
      /^tmp\/extract\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/
    );
  });

  it("presigns a PutObjectCommand for the generated key with PDF content type", async () => {
    mockGetSignedUrl.mockResolvedValue("https://example.com/signed");

    const { key } = await createExtractUploadUrl();

    const [, command, options] = mockGetSignedUrl.mock.calls[0]!;
    expect((command as { input: { Key: string; ContentType: string } }).input.Key).toBe(key);
    expect((command as { input: { Key: string; ContentType: string } }).input.ContentType).toBe(
      "application/pdf"
    );
    expect((options as { expiresIn: number }).expiresIn).toBe(300);
  });
});

describe("headTmpObject()", () => {
  beforeEach(() => s3Mock.reset());

  it("returns the object size when it exists", async () => {
    s3Mock.on(HeadObjectCommand).resolves({ ContentLength: 12345 });
    const size = await headTmpObject("tmp/extract/a.pdf");
    expect(size).toBe(12345);
  });

  it("returns null when the object does not exist", async () => {
    s3Mock.on(HeadObjectCommand).rejects({ name: "NotFound" });
    const size = await headTmpObject("tmp/extract/missing.pdf");
    expect(size).toBeNull();
  });
});

describe("readTmpObjectPrefix()", () => {
  beforeEach(() => s3Mock.reset());

  it("issues a ranged GET and returns the bytes", async () => {
    s3Mock.on(GetObjectCommand).resolves({
      Body: { transformToByteArray: async () => new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]) } as never,
    });

    const buf = await readTmpObjectPrefix("tmp/extract/a.pdf", 5);

    expect(buf.toString("latin1")).toBe("%PDF-");
    const call = s3Mock.commandCalls(GetObjectCommand)[0]!;
    expect(call.args[0].input.Range).toBe("bytes=0-4");
  });
});

describe("deleteTmpObject()", () => {
  beforeEach(() => s3Mock.reset());

  it("deletes the object", async () => {
    s3Mock.on(DeleteObjectCommand).resolves({});
    await deleteTmpObject("tmp/extract/a.pdf");
    expect(s3Mock.commandCalls(DeleteObjectCommand)).toHaveLength(1);
  });

  it("swallows delete errors", async () => {
    s3Mock.on(DeleteObjectCommand).rejects(new Error("boom"));
    await expect(deleteTmpObject("tmp/extract/a.pdf")).resolves.toBeUndefined();
  });
});
