import crypto from "crypto";
import { JSDOM } from "jsdom";
import type { Article, ImportRequest, ImportResponse } from "../types";
import {
  getArticle,
  putArticle,
  getArticleUrlIndex,
  updateArticleUrlIndex,
} from "../repository/article";
import { ValidationError } from "./errors";

const ALLOWED_HOSTS = new Set(["churchofjesuschrist.org", "www.churchofjesuschrist.org"]);
const FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT = "ScriptureJournal/1.0";

// ── Main entry point ──────────────────────────────────────────────────────────

export async function importArticle(request: ImportRequest): Promise<ImportResponse> {
  // Validate allowlist
  const host = new URL(request.url).hostname;
  if (!ALLOWED_HOSTS.has(host)) {
    throw new ValidationError({
      url: `Domain "${host}" is not on the allowlist. Only churchofjesuschrist.org is permitted.`,
    });
  }

  // Determine plain text + title
  let plainText: string;
  let title: string;

  if (request.text && request.title) {
    // Manual paste mode
    plainText = request.text;
    title = request.title;
  } else {
    // URL fetch mode
    const html = await fetchHtml(request.url);
    const parsed = parseHtml(html);
    plainText = parsed.text;
    title = parsed.title;
  }

  // Compute SHA-256 content address
  const articleId = crypto.createHash("sha256").update(plainText).digest("hex");

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
  const urlIndex = await getArticleUrlIndex(request.url);
  if (urlIndex && urlIndex.versions.length > 0) {
    const latestVersion = urlIndex.versions[urlIndex.versions.length - 1];
    if (latestVersion.articleId !== articleId) {
      // New version detected — require confirmation
      if (!request.confirm) {
        return {
          status: "NEW_VERSION",
          previousArticleId: latestVersion.articleId,
          previousImportedAt: latestVersion.importedAt,
          title,
        };
      }

      // Confirmed — write with previousVersionId
      return writeArticle(request.url, articleId, title, plainText, latestVersion.articleId);
    }
  }

  // Fresh import
  return writeArticle(request.url, articleId, title, plainText, undefined);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchHtml(url: string): Promise<string> {
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
    return res.text();
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
  text: string;
  title: string;
}

function parseHtml(html: string): ParsedContent {
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  // Extract paragraphs
  const paragraphEls = doc.querySelectorAll("p");
  const paragraphs: string[] = [];
  paragraphEls.forEach((p) => {
    const text = p.textContent?.trim() ?? "";
    if (text) paragraphs.push(text);
  });

  const plainText = paragraphs.join("\n\n");

  // Derive title (priority order)
  const ogTitle = doc
    .querySelector('meta[property="og:title"]')
    ?.getAttribute("content")
    ?.trim();
  const docTitle = doc.title?.trim();
  const h1 = doc.querySelector("h1")?.textContent?.trim();
  const firstParagraphSnippet =
    paragraphs[0] ? paragraphs[0].slice(0, 60) + (paragraphs[0].length > 60 ? "…" : "") : "";

  const title = ogTitle || docTitle || h1 || firstParagraphSnippet || "Untitled";

  return { text: plainText, title };
}

async function writeArticle(
  sourceUrl: string,
  articleId: string,
  title: string,
  plainText: string,
  previousVersionId: string | undefined
): Promise<ImportResponse> {
  const importedAt = new Date().toISOString();

  // Split plain text into paragraphs
  const rawParagraphs = plainText.split("\n\n");
  const paragraphs = rawParagraphs
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .map((text, index) => ({ index, text }));

  const article: Article = {
    articleId,
    sourceUrl,
    title,
    importedAt,
    scope: "shared",
    paragraphs,
    ...(previousVersionId ? { previousVersionId } : {}),
  };

  await putArticle(article);
  await updateArticleUrlIndex(sourceUrl, articleId, importedAt);

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
