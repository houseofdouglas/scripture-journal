import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { buildEntryId, sha256Hex } from "../entry-id";
import { buildEntryId as serverBuildEntryId } from "../../../repository/annotation";

const DATE = "2026-08-26";
const SCRIPTURE_REF = "content/scripture/book-of-mormon/1-nephi/1.json";
const ARTICLE_REF = "content/articles/abc123.json";

describe("buildEntryId()", () => {
  it("derives the documented entryId for a known contentRef/date pair", async () => {
    // sha256("content/scripture/book-of-mormon/1-nephi/1.json").slice(0, 16)
    await expect(buildEntryId(DATE, SCRIPTURE_REF)).resolves.toBe("2026-08-26_874b693ab03e34da");
    await expect(buildEntryId(DATE, ARTICLE_REF)).resolves.toBe("2026-08-26_c7d319e12ebc60c0");
  });

  it("matches the server's derivation byte for byte", async () => {
    for (const ref of [SCRIPTURE_REF, ARTICLE_REF, "content/articles/ünïcode — ref.json"]) {
      expect(await buildEntryId(DATE, ref)).toBe(serverBuildEntryId(DATE, ref));
    }
  });

  it("is deterministic and date-scoped", async () => {
    const a = await buildEntryId(DATE, SCRIPTURE_REF);
    expect(await buildEntryId(DATE, SCRIPTURE_REF)).toBe(a);
    expect(await buildEntryId("2026-08-27", SCRIPTURE_REF)).not.toBe(a);
  });

  it("hex-encodes the full digest of the UTF-8 bytes", async () => {
    const hex = await sha256Hex(SCRIPTURE_REF);
    expect(hex).toHaveLength(64);
    expect(hex).toBe(crypto.createHash("sha256").update(SCRIPTURE_REF, "utf8").digest("hex"));
  });
});
