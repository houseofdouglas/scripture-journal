#!/usr/bin/env tsx
/**
 * Scripture Ingestion Script
 *
 * Reads all four Standard Works from a local bcbooks/scriptures-json checkout,
 * converts each chapter into the ScriptureChapter schema, and uploads JSON to S3.
 * Also generates and uploads content/scripture/manifest.json.
 *
 * Idempotent: skips chapters already present in S3 (HeadObject check).
 *
 * Setup (one-time):
 *   git clone --depth=1 https://github.com/bcbooks/scriptures-json.git /tmp/scriptures-json
 *
 * Usage:
 *   npm run ingest-scripture:deployed
 *   # optional filters:
 *   npm run ingest-scripture:deployed -- --work book-of-mormon --book 1-ne --chapter 1
 */

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { S3Client, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import type {
  ScriptureChapter,
  ScriptureManifest,
  ManifestWork,
  ManifestBook,
  WorkSlug,
} from "../src/types";

const BUCKET = process.env.BUCKET_NAME;
if (!BUCKET) {
  console.error("ERROR: BUCKET_NAME environment variable is required.");
  process.exit(1);
}

// ── CLI args ──────────────────────────────────────────────────────────────────

const { values: cliArgs } = parseArgs({
  options: {
    work:       { type: "string" },
    book:       { type: "string" },
    chapter:    { type: "string" },
    "data-dir": { type: "string" },
  },
  strict: false,
  allowPositionals: true,
});

const filterWork    = cliArgs.work    ?? null;
const filterBook    = cliArgs.book    ?? null;
const filterChapter = cliArgs.chapter ? parseInt(cliArgs.chapter, 10) : null;
const DATA_DIR      = cliArgs["data-dir"] ?? "/tmp/scriptures-json";

if (!fs.existsSync(DATA_DIR)) {
  console.error(`ERROR: Scripture data directory not found: ${DATA_DIR}`);
  console.error("Run: git clone --depth=1 https://github.com/bcbooks/scriptures-json.git /tmp/scriptures-json");
  process.exit(1);
}

const s3 = new S3Client({ region: process.env.AWS_REGION ?? "us-east-1" });

// ── Source file mapping ───────────────────────────────────────────────────────

interface SourceWork {
  slug: WorkSlug;
  title: string;
  file: string;
  bookSlugMap: Record<string, string>;
  bookGroup?: Record<string, "old-testament" | "new-testament">;
}

const SOURCES: SourceWork[] = [
  {
    slug: "bible-kjv",
    title: "Holy Bible (KJV)",
    file: "",
    bookSlugMap: {
      "gen": "gen", "ex": "ex", "lev": "lev", "num": "num", "deut": "deut",
      "josh": "josh", "judg": "judg", "ruth": "ruth", "1-sam": "1-sam",
      "2-sam": "2-sam", "1-kgs": "1-kgs", "2-kgs": "2-kgs", "1-chr": "1-chr",
      "2-chr": "2-chr", "ezra": "ezra", "neh": "neh", "esth": "esth",
      "job": "job", "ps": "ps", "prov": "prov", "eccl": "eccl", "song": "song",
      "isa": "isa", "jer": "jer", "lam": "lam", "ezek": "ezek", "dan": "dan",
      "hosea": "hosea", "joel": "joel", "amos": "amos", "obad": "obad",
      "jonah": "jonah", "micah": "micah", "nahum": "nahum", "hab": "hab",
      "zeph": "zeph", "hag": "hag", "zech": "zech", "mal": "mal",
      "matt": "matt", "mark": "mark", "luke": "luke", "john": "john",
      "acts": "acts", "rom": "rom", "1-cor": "1-cor", "2-cor": "2-cor",
      "gal": "gal", "eph": "eph", "philip": "philip", "col": "col",
      "1-thes": "1-thes", "2-thes": "2-thes", "1-tim": "1-tim", "2-tim": "2-tim",
      "titus": "titus", "philem": "philem", "heb": "heb", "james": "james",
      "1-pet": "1-pet", "2-pet": "2-pet", "1-jn": "1-jn", "2-jn": "2-jn",
      "3-jn": "3-jn", "jude": "jude", "rev": "rev",
    },
    bookGroup: {
      "gen": "old-testament", "ex": "old-testament", "lev": "old-testament",
      "num": "old-testament", "deut": "old-testament", "josh": "old-testament",
      "judg": "old-testament", "ruth": "old-testament", "1-sam": "old-testament",
      "2-sam": "old-testament", "1-kgs": "old-testament", "2-kgs": "old-testament",
      "1-chr": "old-testament", "2-chr": "old-testament", "ezra": "old-testament",
      "neh": "old-testament", "esth": "old-testament", "job": "old-testament",
      "ps": "old-testament", "prov": "old-testament", "eccl": "old-testament",
      "song": "old-testament", "isa": "old-testament", "jer": "old-testament",
      "lam": "old-testament", "ezek": "old-testament", "dan": "old-testament",
      "hosea": "old-testament", "joel": "old-testament", "amos": "old-testament",
      "obad": "old-testament", "jonah": "old-testament", "micah": "old-testament",
      "nahum": "old-testament", "hab": "old-testament", "zeph": "old-testament",
      "hag": "old-testament", "zech": "old-testament", "mal": "old-testament",
      "matt": "new-testament", "mark": "new-testament", "luke": "new-testament",
      "john": "new-testament", "acts": "new-testament", "rom": "new-testament",
      "1-cor": "new-testament", "2-cor": "new-testament", "gal": "new-testament",
      "eph": "new-testament", "philip": "new-testament", "col": "new-testament",
      "1-thes": "new-testament", "2-thes": "new-testament", "1-tim": "new-testament",
      "2-tim": "new-testament", "titus": "new-testament", "philem": "new-testament",
      "heb": "new-testament", "james": "new-testament", "1-pet": "new-testament",
      "2-pet": "new-testament", "1-jn": "new-testament", "2-jn": "new-testament",
      "3-jn": "new-testament", "jude": "new-testament", "rev": "new-testament",
    },
  },
  {
    slug: "book-of-mormon",
    title: "Book of Mormon",
    file: "book-of-mormon.json",
    bookSlugMap: {
      "1-ne": "1-ne", "2-ne": "2-ne", "jacob": "jacob", "enos": "enos",
      "jarom": "jarom", "omni": "omni", "w-of-m": "w-of-m", "mosiah": "mosiah",
      "alma": "alma", "hel": "hel", "3-ne": "3-ne", "4-ne": "4-ne",
      "morm": "morm", "ether": "ether", "moro": "moro",
    },
  },
  {
    slug: "doctrine-and-covenants",
    title: "Doctrine and Covenants",
    file: "doctrine-and-covenants.json",
    bookSlugMap: { "dc": "dc" },
  },
  {
    slug: "pearl-of-great-price",
    title: "Pearl of Great Price",
    file: "pearl-of-great-price.json",
    bookSlugMap: {
      "moses": "moses", "abr": "abr", "js-m": "js-m", "js-h": "js-h",
      "a-of-f": "a-of-f",
    },
  },
];

// ── bcbooks JSON types ────────────────────────────────────────────────────────

interface BcVerse   { verse: number; text: string; reference: string }
interface BcChapter { chapter: number; verses: BcVerse[]; reference: string }
interface BcBook    { book: string; full_title: string; lds_slug: string; chapters: BcChapter[] }
interface BcWork    { books: BcBook[] }

function loadJson(file: string): BcWork {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8")) as BcWork;
}

// ── S3 helpers ────────────────────────────────────────────────────────────────

function chapterKey(work: WorkSlug, book: string, chapter: number): string {
  return `content/scripture/${work}/${book}/${chapter}.json`;
}

async function keyExists(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET!, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function uploadJson(key: string, data: unknown): Promise<void> {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET!,
    Key: key,
    Body: JSON.stringify(data),
    ContentType: "application/json",
  }));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Ingesting to bucket: ${BUCKET}`);
  console.log(`Data directory:      ${DATA_DIR}\n`);

  const manifestWorks: ManifestWork[] = [];
  let totalChapters = 0;
  let skipped = 0;
  let uploaded = 0;
  let errors = 0;

  for (const source of SOURCES) {
    if (filterWork && source.slug !== filterWork) continue;

    console.log(`\n== ${source.title} ==`);

    // Load source data — Bible is split across two files; D&C uses sections not books
    let bcBooks: BcBook[];
    if (source.slug === "bible-kjv") {
      bcBooks = [...loadJson("old-testament.json").books, ...loadJson("new-testament.json").books];
    } else if (source.slug === "doctrine-and-covenants") {
      const raw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, source.file), "utf8")) as {
        sections: Array<{ section: number; verses: BcVerse[]; reference: string }>;
      };
      bcBooks = [{
        book: "Doctrine and Covenants",
        full_title: "Doctrine and Covenants",
        lds_slug: "dc",
        chapters: raw.sections.map((s) => ({ chapter: s.section, reference: s.reference, verses: s.verses })),
      }];
    } else {
      bcBooks = loadJson(source.file).books;
    }

    const manifestBooks: ManifestBook[] = [];

    for (const bcBook of bcBooks) {
      const ourSlug = source.bookSlugMap[bcBook.lds_slug];
      if (!ourSlug) {
        console.warn(`\nWARN: Unknown lds_slug "${bcBook.lds_slug}" in ${source.slug} — skipping`);
        continue;
      }
      if (filterBook && ourSlug !== filterBook) continue;

      const group = source.bookGroup?.[ourSlug];
      manifestBooks.push({
        slug: ourSlug,
        title: bcBook.full_title ?? bcBook.book,
        chapterCount: bcBook.chapters.length,
        ...(group ? { group } : {}),
      });

      for (const bcChapter of bcBook.chapters) {
        const chapterNum = bcChapter.chapter;
        if (filterChapter && chapterNum !== filterChapter) continue;

        totalChapters++;
        const key = chapterKey(source.slug, ourSlug, chapterNum);

        if (await keyExists(key)) {
          process.stdout.write(".");
          skipped++;
          continue;
        }

        try {
          let title: string;
          if (bcBook.chapters.length === 1) {
            title = bcBook.full_title ?? bcBook.book;
          } else if (source.slug === "doctrine-and-covenants") {
            title = `D&C ${chapterNum}`;
          } else {
            title = `${bcBook.full_title ?? bcBook.book} ${chapterNum}`;
          }

          const chapterData: ScriptureChapter = {
            work: source.slug,
            book: ourSlug,
            chapter: chapterNum,
            title,
            verses: bcChapter.verses.map((v) => ({ number: v.verse, text: v.text })),
          };

          await uploadJson(key, chapterData);
          process.stdout.write("+");
          uploaded++;
        } catch (err) {
          console.error(`\nERROR: ${source.slug}/${ourSlug}/${chapterNum}: ${String(err)}`);
          errors++;
        }
      }

      console.log();
    }

    manifestWorks.push({ slug: source.slug, title: source.title, books: manifestBooks });
  }

  // Upload manifest — skip on filtered runs to avoid clobbering the full manifest
  const manifestKey = "content/scripture/manifest.json";
  if (filterWork || filterBook || filterChapter) {
    console.log(`\nSkipped manifest upload (filtered run).`);
  } else {
    await uploadJson(manifestKey, { works: manifestWorks } as ScriptureManifest);
    console.log(`\nUploaded manifest: ${manifestKey}`);
  }

  console.log(`\n── Summary ──`);
  console.log(`Total chapters: ${totalChapters}`);
  console.log(`Skipped:        ${skipped}`);
  console.log(`Uploaded:       ${uploaded}`);
  console.log(`Errors:         ${errors}`);

  if (errors > 0) {
    console.error("\nCompleted with errors.");
    process.exit(1);
  }
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
