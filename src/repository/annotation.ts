import crypto from "crypto";
import { JournalEntrySchema, UserIndexSchema } from "../types";
import type { JournalEntry, UserIndex, Annotation, ContentType } from "../types";
import { getObject, putObject } from "./s3-client";
import { conditionalWrite } from "./conditional-write";
import { WriteConflictError } from "./errors";

// ── Key helpers ───────────────────────────────────────────────────────────────

function entryKey(userId: string, entryId: string): string {
  return `users/${userId}/entries/${entryId}.json`;
}

function userIndexKey(userId: string): string {
  return `users/${userId}/index.json`;
}

/**
 * Deterministic entryId: `${date}_${sha256(contentRef).slice(0, 16)}`
 * Same (userId, date, contentRef) always yields the same entryId.
 */
export function buildEntryId(date: string, contentRef: string): string {
  const hash = crypto.createHash("sha256").update(contentRef).digest("hex").slice(0, 16);
  return `${date}_${hash}`;
}

// ── Read operations ───────────────────────────────────────────────────────────

export interface EntryWithEtag {
  entry: JournalEntry;
  etag: string;
}

/**
 * Fetch a journal entry + its ETag (needed for conditional write).
 * Returns `null` if the entry does not exist.
 */
export async function getEntry(
  userId: string,
  entryId: string
): Promise<EntryWithEtag | null> {
  const result = await getObject<unknown>(entryKey(userId, entryId));
  if (!result) return null;
  return { entry: JournalEntrySchema.parse(result.data), etag: result.etag };
}

export async function getUserIndex(userId: string): Promise<UserIndex> {
  const result = await getObject<unknown>(userIndexKey(userId));
  if (!result) return { entries: [] };
  return UserIndexSchema.parse(result.data);
}

// ── Write operations ──────────────────────────────────────────────────────────

export interface ContentMeta {
  contentRef: string;
  contentTitle: string;
  contentType: ContentType;
  date: string; // client-supplied YYYY-MM-DD
}

/**
 * Append a new annotation to a JournalEntry, creating the entry if it doesn't
 * exist yet. Uses `conditionalWrite` internally, so 412 conflicts are retried
 * up to 3 times with exponential backoff.
 *
 * @returns the final entry (after successful write) and the saved annotation
 */
export async function appendAnnotation(
  userId: string,
  entryId: string,
  annotation: Annotation,
  meta: ContentMeta
): Promise<{ entry: JournalEntry; annotation: Annotation }> {
  const now = annotation.createdAt;

  const updatedEntry = await conditionalWrite<JournalEntry>(
    entryKey(userId, entryId),
    (current) => {
      if (current === null) {
        // First annotation for this (date, contentRef) — create new entry
        return JournalEntrySchema.parse({
          entryId,
          userId,
          date: meta.date,
          contentRef: meta.contentRef,
          contentTitle: meta.contentTitle,
          contentType: meta.contentType,
          annotations: [annotation],
          updatedAt: now,
        });
      }
      // Append to existing entry
      return {
        ...current,
        annotations: [...current.annotations, annotation],
        updatedAt: now,
      };
    }
  );

  // Update UserIndex (best-effort — failure is non-fatal per spec)
  try {
    await updateUserIndex(userId, entryId, updatedEntry);
  } catch (err) {
    // Log failure but don't propagate — entry is durable, dashboard may be stale
    if (!(err instanceof WriteConflictError)) throw err;
    console.error(`[annotation-repo] UserIndex update failed for entry ${entryId} (write conflict)`);
  }

  return { entry: updatedEntry, annotation };
}

async function updateUserIndex(
  userId: string,
  entryId: string,
  entry: JournalEntry
): Promise<void> {
  await conditionalWrite<UserIndex>(userIndexKey(userId), (current) => {
    const index = current ?? { entries: [] };
    const noteCount = entry.annotations.length;
    const snippet = entry.annotations[0]?.text.slice(0, 200) ?? "";

    const existingIdx = index.entries.findIndex((e) => e.entryId === entryId);

    if (existingIdx === -1) {
      // New entry in index — prepend (newest-first)
      return {
        entries: [
          {
            entryId: entry.entryId,
            date: entry.date,
            contentRef: entry.contentRef,
            contentTitle: entry.contentTitle,
            contentType: entry.contentType,
            snippet,
            noteCount,
          },
          ...index.entries,
        ],
      };
    }

    // Update existing — update noteCount; only update snippet if it was the first annotation
    const updated = [...index.entries];
    updated[existingIdx] = {
      ...updated[existingIdx],
      noteCount,
      // Preserve the original snippet unless this is the very first annotation
      snippet: entry.annotations.length === 1 ? snippet : updated[existingIdx].snippet,
    };
    return { entries: updated };
  });
}
