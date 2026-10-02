// Content hash for URL-imported articles (spec rich-article-blocks FR-15).
//
// articleId = lowercase hex SHA-256 of the hash parts joined with "\n\n".
//
// Parts, in block order:
//   - every block contributes its `text`;
//   - a figure block contributes one EXTRA part immediately after its own text
//     part: `figure:<asset sha256>` when the asset was stored, else
//     `figure:unavailable`.
//
// So the figure sequence `[text "A", figure "Cap" (sha S), text "B"]` hashes
// "A\n\nCap\n\nfigure:S\n\nB". A page with no figures hashes exactly
// `texts.join("\n\n")` — byte-identical to the pre-RAB importer, which hashed
// its `<p>` texts joined with "\n\n". A changed diagram changes the sha part,
// and a figure that later becomes available (or unavailable) changes the id,
// routing the re-import through the NEW_VERSION flow (FR-16).

import crypto from "crypto";
import type { ExtractedBlock } from "./blocks";
import { figureAssetSha } from "./figure";

/** The ordered strings that `computeArticleId` hashes (exported for tests/debugging). */
export function articleHashParts(blocks: readonly ExtractedBlock[]): string[] {
  const parts: string[] = [];
  for (const block of blocks) {
    parts.push(block.text);
    if (block.kind === "figure" && block.figure) {
      const sha = figureAssetSha(block.figure);
      parts.push(sha === null ? "figure:unavailable" : `figure:${sha}`);
    }
  }
  return parts;
}

/** FR-15 `articleId`: SHA-256 (lowercase hex) of `articleHashParts(blocks).join("\n\n")`. */
export function computeArticleId(blocks: readonly ExtractedBlock[]): string {
  return crypto.createHash("sha256").update(articleHashParts(blocks).join("\n\n")).digest("hex");
}
