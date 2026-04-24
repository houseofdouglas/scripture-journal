import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";


import { conditionalWrite } from "../conditional-write";
import { WriteConflictError } from "../errors";

const s3Mock = mockClient(S3Client);

function make412Error() {
  const err = new Error("PreconditionFailed") as Error & {
    $metadata: { httpStatusCode: number };
  };
  err.$metadata = { httpStatusCode: 412 };
  return err;
}

function makeGetResponse(data: unknown, etag: string) {
  return {
    Body: {
      transformToString: async () => JSON.stringify(data),
    } as never,
    ETag: etag,
  };
}

describe("conditionalWrite()", () => {
  beforeEach(() => {
    s3Mock.reset();
    vi.useFakeTimers();
  });

  it("creates a new object with If-None-Match: * when key does not exist", async () => {
    s3Mock.on(GetObjectCommand).rejects({ name: "NoSuchKey" });
    s3Mock.on(PutObjectCommand).resolves({});

    const result = await conditionalWrite<{ count: number }>(
      "test/key.json",
      (current) => ({ count: (current?.count ?? 0) + 1 })
    );

    expect(result).toEqual({ count: 1 });

    const putCall = s3Mock.commandCalls(PutObjectCommand)[0]!;
    expect(putCall.args[0].input.IfNoneMatch).toBe("*");
    expect(putCall.args[0].input.IfMatch).toBeUndefined();
  });

  it("updates an existing object with If-Match: <etag>", async () => {
    const existing = { count: 5 };

    s3Mock.on(GetObjectCommand).resolves(makeGetResponse(existing, '"etag-abc"'));
    s3Mock.on(PutObjectCommand).resolves({});

    const result = await conditionalWrite<{ count: number }>(
      "test/key.json",
      (current) => ({ count: (current?.count ?? 0) + 1 })
    );

    expect(result).toEqual({ count: 6 });

    const putCall = s3Mock.commandCalls(PutObjectCommand)[0]!;
    expect(putCall.args[0].input.IfMatch).toBe('"etag-abc"');
    expect(putCall.args[0].input.IfNoneMatch).toBeUndefined();
  });

  it("retries on 412 and succeeds on second attempt", async () => {
    const existing = { count: 3 };

    s3Mock
      .on(GetObjectCommand)
      .resolvesOnce(makeGetResponse(existing, '"stale-etag"'))
      .resolvesOnce(makeGetResponse({ count: 4 }, '"fresh-etag"'));

    s3Mock
      .on(PutObjectCommand)
      .rejectsOnce(make412Error())
      .resolvesOnce({});

    const writePromise = conditionalWrite<{ count: number }>(
      "test/key.json",
      (current) => ({ count: (current?.count ?? 0) + 1 })
    );

    // Attach resolution handler BEFORE advancing timers to avoid unhandled rejections
    const resultPromise = writePromise.then((v) => v);

    await vi.advanceTimersByTimeAsync(100);

    const result = await resultPromise;
    expect(result).toEqual({ count: 5 });
    expect(s3Mock.commandCalls(PutObjectCommand)).toHaveLength(2);
  });

  it("throws WriteConflictError after 3 consecutive 412s", async () => {
    s3Mock.on(GetObjectCommand).resolves(makeGetResponse({ count: 1 }, '"etag"'));
    s3Mock.on(PutObjectCommand).rejects(make412Error());

    const writePromise = conditionalWrite<{ count: number }>(
      "test/key.json",
      (current) => ({ count: (current?.count ?? 0) + 1 })
    );

    // Attach rejection handler BEFORE advancing timers — prevents unhandled rejection
    const rejection = expect(writePromise).rejects.toThrow(WriteConflictError);

    // Advance through all backoffs: 100ms + 200ms + 400ms = 700ms
    await vi.advanceTimersByTimeAsync(700);

    await rejection;
    // 1 initial + 3 retries = 4 PUT calls
    expect(s3Mock.commandCalls(PutObjectCommand)).toHaveLength(4);
  });
});
