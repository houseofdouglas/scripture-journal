import { promises as dns } from "dns";
import net from "net";

// SSRF-safe image fetcher (spec rich-article-blocks FR-10).
//
// Known residual risk: DNS rebinding. We resolve and validate the hostname,
// then `fetch` resolves it again independently, so a hostile resolver could
// answer differently between the two lookups. Accepted for this app: the
// Lambda runs outside any VPC (no private network to reach), and the main
// target — the instance metadata endpoint — is not exposed to Lambda. Pinning
// the validated IP would require a custom agent and is not worth it here.

export const MAX_RASTER_BYTES = 5 * 1024 * 1024;
export const MAX_SVG_BYTES = 2 * 1024 * 1024;

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
const USER_AGENT = "ScriptureJournal/1.0";

export type FetchImageFailureReason =
  | "INVALID_URL"
  | "NOT_HTTPS"
  | "BLOCKED_HOST"
  | "TOO_MANY_REDIRECTS"
  | "TIMEOUT"
  | "HTTP_ERROR"
  | "TOO_LARGE"
  | "NETWORK_ERROR";

export type FetchImageResult =
  | { ok: true; bytes: Uint8Array; finalUrl: string; contentType: string | null }
  | { ok: false; reason: FetchImageFailureReason };

export interface FetchImageOptions {
  maxBytes: number;
  timeoutMs?: number;
}

// ── IP classification ─────────────────────────────────────────────────────────

function parseIPv4(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    octets.push(n);
  }
  return octets;
}

function isBlockedIPv4(octets: number[]): boolean {
  const [a = 0, b = 0] = octets;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10/8
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 CGNAT
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a >= 224) return true; // 224/4 multicast, 240/4 reserved, 255.255.255.255
  return false;
}

/** Parse an IPv6 address into 8 16-bit groups, or null if malformed. */
function parseIPv6(ip: string): number[] | null {
  let s = ip;
  const zone = s.indexOf("%");
  if (zone !== -1) s = s.slice(0, zone);

  // Embedded dotted IPv4 tail (e.g. ::ffff:127.0.0.1)
  let tail: number[] = [];
  const lastColon = s.lastIndexOf(":");
  if (s.slice(lastColon + 1).includes(".")) {
    const v4 = parseIPv4(s.slice(lastColon + 1));
    if (!v4) return null;
    tail = [((v4[0] ?? 0) << 8) | (v4[1] ?? 0), ((v4[2] ?? 0) << 8) | (v4[3] ?? 0)];
    // Drop the IPv4 tail; keep "::" intact, otherwise drop the separator too.
    s = s.slice(0, lastColon + 1);
    if (!s.endsWith("::")) s = s.slice(0, -1);
  }

  const halves = s.split("::");
  if (halves.length > 2) return null;
  const toGroups = (part: string): number[] | null => {
    if (part === "") return [];
    const out: number[] = [];
    for (const g of part.split(":")) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };
  const head = toGroups(halves[0] ?? "");
  const rest = halves.length === 2 ? toGroups(halves[1] ?? "") : [];
  if (!head || !rest) return null;

  const explicit = head.length + rest.length + tail.length;
  if (halves.length === 1) {
    if (explicit !== 8) return null;
    return [...head, ...tail];
  }
  if (explicit > 7) return null;
  return [...head, ...new Array<number>(8 - explicit).fill(0), ...rest, ...tail];
}

/**
 * True when `ip` is an address we must never connect to: private, loopback,
 * link-local, unspecified, multicast, CGNAT, or reserved. Malformed input is
 * treated as blocked (fail closed).
 */
export function isBlockedAddress(ip: string): boolean {
  const family = net.isIP(ip.split("%")[0] ?? "");
  if (family === 4) {
    const v4 = parseIPv4(ip);
    return v4 ? isBlockedIPv4(v4) : true;
  }
  if (family !== 6) return true;

  const g = parseIPv6(ip);
  if (!g) return true;
  const [g0 = 0, g1 = 0, g2 = 0, g3 = 0, g4 = 0, g5 = 0, g6 = 0, g7 = 0] = g;

  const upperZero = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0;
  if (upperZero && g5 === 0 && g6 === 0 && (g7 === 0 || g7 === 1)) return true; // :: and ::1
  if (upperZero && g5 === 0xffff) {
    // IPv4-mapped ::ffff:a.b.c.d
    return isBlockedIPv4([g6 >> 8, g6 & 0xff, g7 >> 8, g7 & 0xff]);
  }
  if ((g0 & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((g0 & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g0 & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  return false;
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

function log(level: "info" | "warn", message: string, host: string, reason?: string): void {
  // Host only — never the path or query string, which may carry tokens.
  const entry = JSON.stringify({ level, message, host, ...(reason ? { reason } : {}) });
  if (level === "warn") console.warn(entry);
  else console.log(entry);
}

function fail(host: string, reason: FetchImageFailureReason): FetchImageResult {
  log("warn", "image fetch failed", host, reason);
  return { ok: false, reason };
}

/** Resolve and validate a URL's host. Returns a failure reason, or null if safe. */
async function checkHost(url: URL): Promise<FetchImageFailureReason | null> {
  if (url.protocol !== "https:") return "NOT_HTTPS";
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "") return "INVALID_URL";
  if (net.isIP(host)) return isBlockedAddress(host) ? "BLOCKED_HOST" : null;

  let addresses: { address: string }[];
  try {
    addresses = await dns.lookup(host, { all: true });
  } catch {
    return "NETWORK_ERROR";
  }
  if (addresses.length === 0) return "NETWORK_ERROR";
  return addresses.some((a) => isBlockedAddress(a.address)) ? "BLOCKED_HOST" : null;
}

async function readCapped(
  body: ReadableStream<Uint8Array>,
  maxBytes: number
): Promise<Uint8Array | null> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/**
 * Fetch an image over HTTPS with SSRF protections, a redirect limit, a
 * whole-request timeout, and a streamed byte cap. Never throws for expected
 * failures; returns a typed `{ ok: false, reason }` instead.
 */
export async function fetchImage(
  url: string,
  opts: FetchImageOptions
): Promise<FetchImageResult> {
  let current: URL;
  try {
    current = new URL(url);
  } catch {
    return fail("", "INVALID_URL");
  }

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    for (let hop = 0; ; hop++) {
      const blocked = await checkHost(current);
      if (timedOut) return fail(current.hostname, "TIMEOUT");
      if (blocked) return fail(current.hostname, blocked);

      const res = await fetch(current, {
        headers: { "User-Agent": USER_AGENT },
        redirect: "manual",
        signal: controller.signal,
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        await res.body?.cancel().catch(() => undefined);
        if (!location) return fail(current.hostname, "HTTP_ERROR");
        if (hop >= MAX_REDIRECTS) return fail(current.hostname, "TOO_MANY_REDIRECTS");
        try {
          current = new URL(location, current);
        } catch {
          return fail(current.hostname, "INVALID_URL");
        }
        continue;
      }

      if (!res.ok) {
        await res.body?.cancel().catch(() => undefined);
        return fail(current.hostname, "HTTP_ERROR");
      }

      const declared = res.headers.get("content-length");
      if (declared !== null && Number(declared) > opts.maxBytes) {
        await res.body?.cancel().catch(() => undefined);
        return fail(current.hostname, "TOO_LARGE");
      }

      const bytes = res.body ? await readCapped(res.body, opts.maxBytes) : new Uint8Array(0);
      if (!bytes) return fail(current.hostname, "TOO_LARGE");

      log("info", "image fetched", current.hostname);
      return {
        ok: true,
        bytes,
        finalUrl: current.toString(),
        contentType: res.headers.get("content-type"),
      };
    }
  } catch {
    return fail(current.hostname, timedOut ? "TIMEOUT" : "NETWORK_ERROR");
  } finally {
    clearTimeout(timer);
  }
}
