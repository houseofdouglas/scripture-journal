/**
 * Client-side mirror of the server's entryId derivation.
 *
 * Must stay byte-for-byte identical to `buildEntryId()` in
 * `src/repository/annotation.ts` — the client uses it to GET the entry the
 * Lambda wrote at `users/<userId>/entries/<entryId>.json`.
 *
 * Node's `crypto.createHash("sha256").update(contentRef)` hashes the UTF-8
 * bytes of the string, which is what `TextEncoder` produces here.
 */

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Hex-encoded SHA-256 of the UTF-8 bytes of `input`. */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return toHex(digest);
}

/**
 * Deterministic entryId: `${date}_${sha256(contentRef).slice(0, 16)}`
 * (annotation spec FR-6). Same (date, contentRef) always yields the same id.
 */
export async function buildEntryId(date: string, contentRef: string): Promise<string> {
  const hash = await sha256Hex(contentRef);
  return `${date}_${hash.slice(0, 16)}`;
}
