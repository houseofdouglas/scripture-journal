import crypto from "crypto";
import { ArticleSchema, ArticleUrlIndexSchema, ArticleIndexSchema } from "../types";
import type { Article, ArticleUrlIndex, ArticleIndex } from "../types";
import { getObject, putObject } from "./s3-client";
import { conditionalWrite } from "./conditional-write";

// ── Key helpers ───────────────────────────────────────────────────────────────

const ARTICLE_INDEX_KEY = "content/articles/index.json";

function articleKey(articleId: string): string {
  return `content/articles/${articleId}.json`;
}

function urlIndexKey(sourceUrl: string): string {
  const hash = crypto.createHash("sha256").update(sourceUrl).digest("hex");
  return `content/articles/url-index/${hash}.json`;
}

// ── Read operations ───────────────────────────────────────────────────────────

/**
 * Fetch an article by its SHA-256 content ID.
 * Returns `null` if not found.
 */
export async function getArticle(articleId: string): Promise<Article | null> {
  const result = await getObject<unknown>(articleKey(articleId));
  if (!result) return null;
  return ArticleSchema.parse(result.data);
}

/**
 * Fetch the URL index for a given source URL.
 * Returns `null` if the URL has never been imported.
 */
export async function getArticleUrlIndex(sourceUrl: string): Promise<ArticleUrlIndex | null> {
  const result = await getObject<unknown>(urlIndexKey(sourceUrl));
  if (!result) return null;
  return ArticleUrlIndexSchema.parse(result.data);
}

// ── Write operations ──────────────────────────────────────────────────────────

/**
 * Write a new article to S3 with `If-None-Match: *`.
 * Content-addressed: same articleId = identical bytes, so a duplicate PUT is safe.
 * If the key already exists, the write is silently skipped (412 = already there).
 */
export async function putArticle(article: Article): Promise<void> {
  try {
    await putObject(articleKey(article.articleId), article, { ifNoneMatch: "*" });
  } catch (err: unknown) {
    const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 412) return; // already exists — identical content, safe to ignore
    throw err;
  }
}

/**
 * Append a new version entry to the URL index using a conditional write.
 * Creates the index if it doesn't exist yet.
 */
export async function updateArticleUrlIndex(
  sourceUrl: string,
  articleId: string,
  importedAt: string
): Promise<void> {
  await conditionalWrite<ArticleUrlIndex>(urlIndexKey(sourceUrl), (current) => {
    const existing = current ?? { sourceUrl, versions: [] };
    return {
      sourceUrl: existing.sourceUrl,
      versions: [
        ...existing.versions,
        { articleId, importedAt },
      ],
    };
  });
}

/**
 * Fetch the article browse index.
 * Returns null if the index does not exist yet (no articles imported).
 */
export async function getArticleIndex(): Promise<{ data: ArticleIndex; etag: string } | null> {
  const result = await getObject<unknown>(ARTICLE_INDEX_KEY);
  if (!result) return null;
  return { data: ArticleIndexSchema.parse(result.data), etag: result.etag };
}

/**
 * Atomically update the article browse index using a read-modify-write.
 *
 * The `mutate` function receives the current index (never null — a missing
 * index is normalised to `{ articles: [] }` before calling `mutate`).
 * Retries up to 3 times on 412 Precondition Failed; throws WriteConflictError
 * on persistent conflict.
 */
export async function updateArticleIndex(
  mutate: (current: ArticleIndex) => ArticleIndex
): Promise<void> {
  await conditionalWrite<unknown>(ARTICLE_INDEX_KEY, (raw) => {
    const current: ArticleIndex =
      raw !== null ? ArticleIndexSchema.parse(raw) : { articles: [] };
    return mutate(current);
  });
}
