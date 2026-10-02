import { log } from "../lib/log";
import crypto from "crypto";
import { JSDOM, VirtualConsole } from "jsdom";
import {
  CloudFrontClient,
  CreateInvalidationCommand,
} from "@aws-sdk/client-cloudfront";
import { ArticleSchema } from "../types";
import type { Article, ArticleParagraph, ImportRequest, ImportResponse } from "../types";
import { selectContentRoot } from "./article-extract/content-root";
import { extractBlocks, type BlockOutput, type ExtractedBlock } from "./article-extract/blocks";
import { resolveFigures } from "./article-extract/figure";
import { computeArticleId } from "./article-extract/hash";
import {
  getArticle,
  putArticle,
  getArticleUrlIndex,
  updateArticleUrlIndex,
  updateArticleIndex,
  setArticleArchived,
} from "../repository/article";
import { ValidationError } from "./errors";
import { env } from "../config/env";

const cloudfront = new CloudFrontClient({ region: "us-east-1" });

const FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT = "ScriptureJournal/1.0";

// ── Time budget (spec rich-article-blocks NFR: ≤ 30 s at p95) ──────────────────
//
// The request path is CloudFront → API Gateway HTTP API → Lambda. The Lambda
// timeout is 90 s (infra/lambda.tf, sized for Textract), but the HTTP API
// integration timeout is hard-capped at 30 s and CloudFront's default origin
// read timeout is also 30 s, so 30 s is the real ceiling. Budget:
//   page fetch            ≤ 10 s (FETCH_TIMEOUT_MS)
//   figure resolution     ≤ min(20 s, 25 s − time already spent)
//                           (concurrency 4, 10 s per image inside fetchImage)
//   parse + hash + S3     the remaining ~5 s of headroom
// Figures not resolved by the deadline are stored as unavailable (FR-13).
/** Upper bound on figure resolution for one import. */
export const FIGURE_DEADLINE_MS = 20_000;
/** Figure resolution must finish by this many ms after the import started. */
export const IMPORT_FIGURE_CUTOFF_MS = 25_000;

// ── Main entry point ──────────────────────────────────────────────────────────

export async function importArticle(request: ImportRequest): Promise<ImportResponse> {
  // PDF mode — no URL; process text directly
  if (!request.url) {
    const { text, title } = request as { text: string; title: string };
    return importPdfContent(text, title);
  }

  if (request.text && request.title) {
    // Manual paste mode — text-only blocks, hashed as the pasted text.
    return importManualContent(request.url, request.text, request.title, request.confirm);
  }

  // URL fetch mode — any URL is accepted
  return importFetchedUrl(request.url, request.confirm);
}

async function importManualContent(
  url: string,
  plainText: string,
  title: string,
  confirm: boolean | undefined
): Promise<ImportResponse> {
  // Compute SHA-256 content address
  const articleId = crypto.createHash("sha256").update(plainText).digest("hex");
  return dedupeAndWrite(url, articleId, title, confirm, () => textParagraphs(plainText), false);
}

/**
 * URL fetch mode: fetch → content root → blocks → figures → FR-15 hash.
 *
 * Ordering trade-off: figures are fetched and their assets written BEFORE the
 * duplicate check, because the `articleId` depends on each figure's asset
 * sha256 (FR-15) and is therefore unknown until the bytes are in hand. A
 * duplicate re-import thus re-fetches its images and re-issues the asset PUTs.
 * That is wasted but harmless work: assets are content-addressed and
 * write-once (`If-None-Match: *`, 412 = success), so nothing is overwritten
 * and no orphan differs from what the original import stored. Deferring the
 * PUTs until after the duplicate check would mean holding every image's bytes
 * in memory and losing FR-13's "store failure → unavailable" downgrade (the id
 * would already be fixed), so it is not done. Pages without figures do no
 * extra work at all.
 */
async function importFetchedUrl(url: string, confirm: boolean | undefined): Promise<ImportResponse> {
  const startedAt = Date.now();
  const page = await fetchHtml(url);
  const parsed = parseHtml(page.html);
  if (parsed.outputs.length === 0) {
    throw new ValidationError({ url: "No article content found at this URL." });
  }

  const timeBudgetMs = Math.min(FIGURE_DEADLINE_MS, IMPORT_FIGURE_CUTOFF_MS - (Date.now() - startedAt));
  const blocks = await resolveFigures(parsed.outputs, { baseUrl: page.finalUrl, timeBudgetMs });
  const articleId = computeArticleId(blocks);

  const figures = blocks.filter((b) => b.kind === "figure");
  // Structured import log. Never includes URLs (query strings may carry tokens).
  log.info("article import parsed", {
    articleId,
    blockCount: blocks.length,
    figureCount: figures.length,
    unavailableFigureCount: figures.filter((b) => b.figure?.unavailable === true).length,
  });

  return dedupeAndWrite(url, articleId, parsed.title, confirm, () => indexBlocks(blocks), true);
}

/**
 * Shared duplicate → version → write flow for URL-keyed imports (manual paste
 * and URL fetch). `buildParagraphs` is only invoked when an article is written.
 */
async function dedupeAndWrite(
  url: string,
  articleId: string,
  title: string,
  confirm: boolean | undefined,
  buildParagraphs: () => ArticleParagraph[],
  validate: boolean
): Promise<ImportResponse> {
  // Duplicate check
  const existing = await getArticle(articleId);
  if (existing) {
    return {
      status: "DUPLICATE",
      articleId: existing.articleId,
      title: existing.title,
      importedAt: existing.importedAt,
    };
  }

  // Version check — look up URL index
  const urlIndex = await getArticleUrlIndex(url);
  if (urlIndex && urlIndex.versions.length > 0) {
    const latestVersion = urlIndex.versions[urlIndex.versions.length - 1]!;
    if (latestVersion.articleId !== articleId) {
      // New version detected — require confirmation
      if (!confirm) {
        return {
          status: "NEW_VERSION",
          previousArticleId: latestVersion.articleId,
          previousImportedAt: latestVersion.importedAt,
          title,
        };
      }

      // Confirmed — write with previousVersionId
      return writeArticle(url, articleId, title, buildParagraphs(), latestVersion.articleId, validate);
    }
  }

  // Fresh import
  return writeArticle(url, articleId, title, buildParagraphs(), undefined, validate);
}

async function importPdfContent(text: string, title: string): Promise<ImportResponse> {
  const articleId = crypto.createHash("sha256").update(text).digest("hex");

  const existing = await getArticle(articleId);
  if (existing) {
    return {
      status: "DUPLICATE",
      articleId: existing.articleId,
      title: existing.title,
      importedAt: existing.importedAt,
    };
  }

  // Synthetic sourceUrl unique to this content — no URL version history for PDFs
  const sourceUrl = `pdf-import:${articleId}`;
  return writeArticle(sourceUrl, articleId, title, textParagraphs(text), undefined, false);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

interface FetchedPage {
  html: string;
  /** URL after redirects (falls back to the requested URL); base for relative image URLs. */
  finalUrl: string;
}

async function fetchHtml(url: string): Promise<FetchedPage> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new ValidationError({ url: `Fetch failed: HTTP ${res.status}` });
    }
    return { html: await res.text(), finalUrl: res.url || url };
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new ValidationError({ url: "Request timed out after 10 seconds." });
    }
    if (err instanceof ValidationError) throw err;
    throw new ValidationError({ url: `Could not fetch the URL: ${String(err)}` });
  } finally {
    clearTimeout(timer);
  }
}

interface ParsedContent {
  /** Blocks in document order; figures still pending resolution. */
  outputs: BlockOutput[];
  title: string;
}

function parseHtml(html: string): ParsedContent {
  // A bare VirtualConsole swallows jsdom's "Could not parse CSS stylesheet" noise.
  const dom = new JSDOM(html, { virtualConsole: new VirtualConsole() });
  const doc = dom.window.document;

  const outputs = extractBlocks(selectContentRoot(doc));

  // Title derivation is unchanged from the pre-rich-blocks importer, including
  // its fallback to the first non-empty <p> under .body-block → article → main
  // → body (not the FR-2 content root), so titles of re-imports stay stable.
  const legacyRoot =
    doc.querySelector(".body-block") ??
    doc.querySelector("article") ??
    doc.querySelector("main") ??
    doc.body;
  const paragraphs: string[] = [];
  for (const p of Array.from(legacyRoot?.querySelectorAll("p") ?? [])) {
    const text = p.textContent?.trim() ?? "";
    if (text) {
      paragraphs.push(text);
      break;
    }
  }

  // Derive title (priority order)
  const ogTitle = doc
    .querySelector('meta[property="og:title"]')
    ?.getAttribute("content")
    ?.trim();
  const docTitle = doc.title?.trim() ?? "";
  const h1 = doc.querySelector("h1")?.textContent?.trim() ?? "";
  const firstParagraphSnippet =
    paragraphs[0] ? paragraphs[0].slice(0, 60) + (paragraphs[0].length > 60 ? "…" : "") : "";

  const title = ogTitle || docTitle || h1 || firstParagraphSnippet || "Untitled";

  return { outputs, title };
}

/** Manual-paste / PDF modes: split plain text into text-only paragraphs. */
function textParagraphs(plainText: string): ArticleParagraph[] {
  const rawParagraphs = plainText.split("\n\n");
  return rawParagraphs
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .map((text, index) => ({ index, text }));
}

/** URL mode: assign annotation block ids 0..n-1 in document order. */
function indexBlocks(blocks: readonly ExtractedBlock[]): ArticleParagraph[] {
  return blocks.map((block, index) => ({ index, ...block }));
}

async function writeArticle(
  sourceUrl: string,
  articleId: string,
  title: string,
  paragraphs: ArticleParagraph[],
  previousVersionId: string | undefined,
  validate: boolean
): Promise<ImportResponse> {
  const importedAt = new Date().toISOString();

  let article: Article = {
    articleId,
    sourceUrl,
    title,
    importedAt,
    scope: "shared",
    paragraphs,
    ...(previousVersionId ? { previousVersionId } : {}),
  };

  if (validate) {
    // URL-mode blocks carry structured payloads; refuse to store anything the
    // schema (and so the reader UI) would not accept.
    const result = ArticleSchema.safeParse(article);
    if (!result.success) {
      log.error("imported article failed schema validation", {
        articleId,
        issues: result.error.issues.slice(0, 5).map((i) => ({ path: i.path.join("."), message: i.message })),
      });
      throw new ValidationError({ url: "The article content could not be stored." });
    }
    article = result.data;
  }

  await putArticle(article);
  await updateArticleUrlIndex(sourceUrl, articleId, importedAt);
  await updateArticleIndex((current) => {
    const entry = { articleId, title, sourceUrl, importedAt, archived: false };
    if (previousVersionId) {
      // Version import: replace the existing entry for this URL, prepend new one
      const filtered = current.articles.filter((a) => a.sourceUrl !== sourceUrl);
      return { articles: [entry, ...filtered] };
    }
    // Fresh import: prepend
    return { articles: [entry, ...current.articles] };
  });
  await invalidateArticleIndex(articleId);

  if (previousVersionId) {
    return {
      status: "VERSION_IMPORTED",
      articleId,
      title,
      importedAt,
      previousArticleId: previousVersionId,
    };
  }

  return { status: "IMPORTED", articleId, title, importedAt };
}

/**
 * Archive an article: hides it from the default Browse Articles list while
 * leaving `content/articles/<articleId>.json` and all journal entries/
 * annotations referencing it untouched.
 *
 * Returns `null` if `articleId` has no matching entry in the article index
 * (e.g. it's an older version's id, or the index doesn't exist yet).
 */
export async function archiveArticle(
  articleId: string
): Promise<{ articleId: string; archived: true } | null> {
  const found = await setArticleArchived(articleId, true);
  if (!found) return null;
  await invalidateArticleIndex(crypto.randomUUID());
  return { articleId, archived: true };
}

/**
 * Reverse of `archiveArticle` — restores the article to the default
 * Browse Articles list. Returns `null` under the same conditions.
 */
export async function unarchiveArticle(
  articleId: string
): Promise<{ articleId: string; archived: false } | null> {
  const found = await setArticleArchived(articleId, false);
  if (!found) return null;
  await invalidateArticleIndex(crypto.randomUUID());
  return { articleId, archived: false };
}

/**
 * Issue a CloudFront invalidation for the article index so the updated
 * list is immediately visible after an import.
 * No-ops when CLOUDFRONT_DISTRIBUTION_ID is not set (local dev / tests).
 */
async function invalidateArticleIndex(callerReference: string): Promise<void> {
  if (!env.CLOUDFRONT_DISTRIBUTION_ID) return;
  await cloudfront.send(
    new CreateInvalidationCommand({
      DistributionId: env.CLOUDFRONT_DISTRIBUTION_ID,
      InvalidationBatch: {
        CallerReference: callerReference,
        Paths: { Quantity: 1, Items: ["/content/articles/index.json"] },
      },
    })
  );
}
