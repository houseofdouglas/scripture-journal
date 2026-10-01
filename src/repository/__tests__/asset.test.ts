import crypto from "crypto";
import { describe, it, expect, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

import { putAsset, sha256Hex } from "../asset";
import { ASSET_KEY_PATTERN } from "../../types/article";

const s3Mock = mockClient(S3Client);

function makeStatusError(status: number, name: string) {
  const err = new Error(name) as Error & { $metadata: { httpStatusCode: number } };
  err.name = name;
  err.$metadata = { httpStatusCode: status };
  return err;
}

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const PNG_SHA = crypto.createHash("sha256").update(PNG_BYTES).digest("hex");

describe("sha256Hex()", () => {
  it("returns the lowercase hex sha256 of the bytes", () => {
    expect(sha256Hex(PNG_BYTES)).toBe(PNG_SHA);
    expect(sha256Hex(PNG_BYTES)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("putAsset()", () => {
  beforeEach(() => s3Mock.reset());

  it("writes a new asset with content-addressed key and immutable headers", async () => {
    s3Mock.on(PutObjectCommand).resolves({});

    const key = await putAsset(PNG_BYTES, "png", "image/png");

    expect(key).toBe(`content/assets/${PNG_SHA}.png`);
    expect(key).toMatch(ASSET_KEY_PATTERN);
    const calls = s3Mock.commandCalls(PutObjectCommand);
    expect(calls).toHaveLength(1);
    const input = calls[0]!.args[0].input;
    expect(input.Bucket).toBe("test-bucket");
    expect(input.Key).toBe(key);
    expect(input.Body).toBe(PNG_BYTES);
    expect(input.ContentType).toBe("image/png");
    expect(input.CacheControl).toBe("public, max-age=31536000, immutable");
    expect(input.IfNoneMatch).toBe("*");
  });

  it("treats 412 PreconditionFailed (object already exists) as success", async () => {
    s3Mock.on(PutObjectCommand).rejects(makeStatusError(412, "PreconditionFailed"));

    await expect(putAsset(PNG_BYTES, "png", "image/png")).resolves.toBe(
      `content/assets/${PNG_SHA}.png`
    );
  });

  it("propagates other errors", async () => {
    s3Mock.on(PutObjectCommand).rejects(makeStatusError(403, "AccessDenied"));

    await expect(putAsset(PNG_BYTES, "png", "image/png")).rejects.toThrow("AccessDenied");
  });

  it("returns the same key for the same bytes, and a different key for different bytes", async () => {
    s3Mock.on(PutObjectCommand).resolves({});

    const a = await putAsset(new Uint8Array(PNG_BYTES), "png", "image/png");
    const b = await putAsset(new Uint8Array(PNG_BYTES), "png", "image/png");
    const c = await putAsset(new Uint8Array([9, 9, 9]), "png", "image/png");

    expect(a).toBe(b);
    expect(c).not.toBe(a);
  });

  it("uses the given extension in the key", async () => {
    s3Mock.on(PutObjectCommand).resolves({});

    const key = await putAsset(PNG_BYTES, "svg", "image/svg+xml");

    expect(key).toBe(`content/assets/${PNG_SHA}.svg`);
    expect(s3Mock.commandCalls(PutObjectCommand)[0]!.args[0].input.ContentType).toBe(
      "image/svg+xml"
    );
  });
});
