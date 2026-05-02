import { describe, it, expect, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getArticleIndex, updateArticleIndex } from "../article";
import { WriteConflictError } from "../errors";

const s3Mock = mockClient(S3Client);

const VALID_ARTICLE_ID = "a".repeat(64);
const VALID_ARTICLE_ID_2 = "b".repeat(64);

const SAMPLE_ENTRY = {
  articleId: VALID_ARTICLE_ID,
  title: "Faith in Jesus Christ",
  sourceUrl: "https://churchofjesuschrist.org/study/manual/faith",
  importedAt: "2026-04-22T10:00:00.000Z",
};

const SAMPLE_INDEX = { articles: [SAMPLE_ENTRY] };

function makeGetResponse(data: unknown, etag: string) {
  return {
    Body: {
      transformToString: async () => JSON.stringify(data),
    } as never,
    ETag: etag,
  };
}

function make412Error() {
  const err = new Error("PreconditionFailed") as Error & {
    $metadata: { httpStatusCode: number };
  };
  err.$metadata = { httpStatusCode: 412 };
  return err;
}

describe("getArticleIndex()", () => {
  beforeEach(() => s3Mock.reset());

  it("returns null when the index does not exist (404)", async () => {
    s3Mock.on(GetObjectCommand).rejects({ name: "NoSuchKey" });
    const result = await getArticleIndex();
    expect(result).toBeNull();
  });

  it("returns parsed ArticleIndex and etag on success", async () => {
    s3Mock
      .on(GetObjectCommand)
      .resolves(makeGetResponse(SAMPLE_INDEX, '"etag-123"'));

    const result = await getArticleIndex();
    expect(result).not.toBeNull();
    expect(result!.data).toEqual(SAMPLE_INDEX);
    expect(result!.etag).toBe('"etag-123"');
  });

  it("throws on malformed index data", async () => {
    const bad = { articles: [{ articleId: "too-short", title: "" }] };
    s3Mock.on(GetObjectCommand).resolves(makeGetResponse(bad, '"etag-bad"'));
    await expect(getArticleIndex()).rejects.toThrow();
  });
});

describe("updateArticleIndex()", () => {
  beforeEach(() => {
    s3Mock.reset();
  });

  it("creates a new index with If-None-Match: * when none exists", async () => {
    s3Mock.on(GetObjectCommand).rejects({ name: "NoSuchKey" });
    s3Mock.on(PutObjectCommand).resolves({});

    await updateArticleIndex((current) => ({
      articles: [...current.articles, SAMPLE_ENTRY],
    }));

    const putCall = s3Mock.commandCalls(PutObjectCommand)[0]!;
    expect(putCall.args[0].input.IfNoneMatch).toBe("*");
    expect(putCall.args[0].input.IfMatch).toBeUndefined();

    const body = JSON.parse(putCall.args[0].input.Body as string);
    expect(body.articles).toHaveLength(1);
    expect(body.articles[0].articleId).toBe(VALID_ARTICLE_ID);
  });

  it("passes { articles: [] } to mutator when index does not exist", async () => {
    s3Mock.on(GetObjectCommand).rejects({ name: "NoSuchKey" });
    s3Mock.on(PutObjectCommand).resolves({});

    let receivedCurrent: { articles: unknown[] } | null = null;
    await updateArticleIndex((current) => {
      receivedCurrent = current;
      return current;
    });

    expect(receivedCurrent).toEqual({ articles: [] });
  });

  it("updates an existing index with If-Match: <etag>", async () => {
    s3Mock
      .on(GetObjectCommand)
      .resolves(makeGetResponse(SAMPLE_INDEX, '"etag-abc"'));
    s3Mock.on(PutObjectCommand).resolves({});

    const newEntry = {
      articleId: VALID_ARTICLE_ID_2,
      title: "The Living Christ",
      sourceUrl: "https://churchofjesuschrist.org/study/the-living-christ",
      importedAt: "2026-04-23T10:00:00.000Z",
    };

    await updateArticleIndex((current) => ({
      articles: [newEntry, ...current.articles],
    }));

    const putCall = s3Mock.commandCalls(PutObjectCommand)[0]!;
    expect(putCall.args[0].input.IfMatch).toBe('"etag-abc"');

    const body = JSON.parse(putCall.args[0].input.Body as string);
    expect(body.articles).toHaveLength(2);
    expect(body.articles[0].articleId).toBe(VALID_ARTICLE_ID_2);
  });

  it("retries up to 3 times on 412 then throws WriteConflictError", async () => {
    s3Mock
      .on(GetObjectCommand)
      .resolves(makeGetResponse(SAMPLE_INDEX, '"etag"'));
    s3Mock.on(PutObjectCommand).rejects(make412Error());

    await expect(
      updateArticleIndex((current) => current)
    ).rejects.toThrow(WriteConflictError);

    // 1 initial + 3 retries = 4 PUT calls
    expect(s3Mock.commandCalls(PutObjectCommand)).toHaveLength(4);
  });
});
