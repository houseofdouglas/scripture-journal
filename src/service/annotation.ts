import crypto from "crypto";
import { appendAnnotation, buildEntryId } from "../repository/annotation";
import { WriteConflictError } from "../repository/errors";
import { ValidationError } from "./errors";
import type { AnnotateRequest, AnnotateResponse } from "../types";

/**
 * Validate and save an annotation for the authenticated user.
 *
 * Security contract:
 * - `userId` is always sourced from the JWT `sub` claim (passed in, never from request body)
 * - `contentRef` must start with `content/` — user-scoped paths are rejected
 * - Annotation text is never logged
 *
 * @param userId  From JWT sub
 * @param req     Validated request body
 * @returns       AnnotateResponse with the saved annotation and updated noteCount
 */
export async function annotate(userId: string, req: AnnotateRequest): Promise<AnnotateResponse> {
  // Validate contentRef prefix
  if (!req.contentRef.startsWith("content/")) {
    throw new ValidationError({
      contentRef: "contentRef must reference shared content (must start with 'content/')",
    });
  }

  const entryId = buildEntryId(req.date, req.contentRef);
  const createdAt = new Date().toISOString();

  const annotation = {
    blockId: req.blockId,
    text: req.text,
    createdAt,
  };

  try {
    const { entry } = await appendAnnotation(userId, entryId, annotation, {
      contentRef: req.contentRef,
      contentTitle: req.contentTitle,
      contentType: req.contentType,
      date: req.date,
    });

    return {
      entryId,
      annotation,
      noteCount: entry.annotations.length,
    };
  } catch (err) {
    if (err instanceof WriteConflictError) {
      throw err; // handler maps to 409
    }
    throw err;
  }
}

/** Verify that a contentRef is sha256-addressable for entryId computation. */
export function buildEntryIdForContentRef(date: string, contentRef: string): string {
  const hash = crypto.createHash("sha256").update(contentRef).digest("hex").slice(0, 16);
  return `${date}_${hash}`;
}
