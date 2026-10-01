import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { lookup } = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("dns", () => ({ promises: { lookup }, default: { promises: { lookup } } }));

import {
  fetchImage,
  isBlockedAddress,
  MAX_RASTER_BYTES,
  MAX_SVG_BYTES,
} from "../image-fetch";

const fetchMock = vi.fn();

function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  });
}

function redirect(location: string, status = 302): Response {
  return new Response(null, { status, headers: { location } });
}

beforeEach(() => {
  lookup.mockReset();
  lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("constants", () => {
  it("exports size caps", () => {
    expect(MAX_RASTER_BYTES).toBe(5 * 1024 * 1024);
    expect(MAX_SVG_BYTES).toBe(2 * 1024 * 1024);
  });
});

describe("isBlockedAddress", () => {
  it.each([
    "0.0.0.0",
    "0.1.2.3",
    "10.0.0.1",
    "10.255.255.255",
    "100.64.0.1",
    "100.127.255.255",
    "127.0.0.1",
    "127.1.2.3",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "224.0.0.1",
    "239.255.255.255",
    "240.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "0:0:0:0:0:0:0:1",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "fe80::1%eth0",
    "febf::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:169.254.169.254",
    "::ffff:10.0.0.1",
    "::ffff:7f00:1",
    "not-an-ip",
    "",
  ])("blocks %s", (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it.each([
    "93.184.216.34",
    "8.8.8.8",
    "100.63.255.255",
    "100.128.0.1",
    "172.15.255.255",
    "172.32.0.1",
    "169.253.1.1",
    "192.167.1.1",
    "223.255.255.255",
    "2606:4700::1111",
    "2001:4860:4860::8888",
    "::ffff:93.184.216.34",
    "fec0::1",
  ])("allows %s", (ip) => {
    expect(isBlockedAddress(ip)).toBe(false);
  });
});

describe("fetchImage", () => {
  it("rejects malformed URLs", async () => {
    expect(await fetchImage("not a url", { maxBytes: 100 })).toEqual({
      ok: false,
      reason: "INVALID_URL",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses http:", async () => {
    expect(await fetchImage("http://example.com/a.png", { maxBytes: 100 })).toEqual({
      ok: false,
      reason: "NOT_HTTPS",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(lookup).not.toHaveBeenCalled();
  });

  it.each([
    "https://169.254.169.254/latest/meta-data/",
    "https://127.0.0.1/a.png",
    "https://10.0.0.1/a.png",
    "https://[::1]/a.png",
    "https://[::ffff:127.0.0.1]/a.png",
  ])("refuses literal private host %s without fetching", async (url) => {
    expect(await fetchImage(url, { maxBytes: 100 })).toEqual({
      ok: false,
      reason: "BLOCKED_HOST",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(lookup).not.toHaveBeenCalled();
  });

  it("refuses a hostname resolving to a private address", async () => {
    lookup.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "10.1.2.3", family: 4 },
    ]);
    expect(await fetchImage("https://sneaky.example/a.png", { maxBytes: 100 })).toEqual({
      ok: false,
      reason: "BLOCKED_HOST",
    });
    expect(lookup).toHaveBeenCalledWith("sneaky.example", { all: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns NETWORK_ERROR when DNS fails", async () => {
    lookup.mockRejectedValue(new Error("ENOTFOUND"));
    expect(await fetchImage("https://nx.example/a.png", { maxBytes: 100 })).toEqual({
      ok: false,
      reason: "NETWORK_ERROR",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a redirect to a private literal host", async () => {
    fetchMock.mockResolvedValueOnce(redirect("https://169.254.169.254/latest/meta-data/"));
    expect(await fetchImage("https://example.com/a.png", { maxBytes: 100 })).toEqual({
      ok: false,
      reason: "BLOCKED_HOST",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refuses a redirect to a hostname resolving privately", async () => {
    lookup.mockImplementation((host: string) =>
      Promise.resolve(
        host === "internal.example"
          ? [{ address: "fd00::5", family: 6 }]
          : [{ address: "93.184.216.34", family: 4 }]
      )
    );
    fetchMock.mockResolvedValueOnce(redirect("https://internal.example/x"));
    expect(await fetchImage("https://example.com/a.png", { maxBytes: 100 })).toEqual({
      ok: false,
      reason: "BLOCKED_HOST",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refuses a redirect to http:", async () => {
    fetchMock.mockResolvedValueOnce(redirect("http://example.com/a.png"));
    expect(await fetchImage("https://example.com/a.png", { maxBytes: 100 })).toEqual({
      ok: false,
      reason: "NOT_HTTPS",
    });
  });

  it("follows up to 3 redirects, resolving relative Location", async () => {
    fetchMock
      .mockResolvedValueOnce(redirect("/b.png"))
      .mockResolvedValueOnce(redirect("https://cdn.example/c.png", 301))
      .mockResolvedValueOnce(redirect("d.png", 307))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    const res = await fetchImage("https://example.com/img/a.png?sig=secret", { maxBytes: 100 });
    expect(res).toMatchObject({ ok: true, finalUrl: "https://cdn.example/d.png" });
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls).toEqual([
      "https://example.com/img/a.png?sig=secret",
      "https://example.com/b.png",
      "https://cdn.example/c.png",
      "https://cdn.example/d.png",
    ]);
    expect(lookup).toHaveBeenCalledTimes(4);
  });

  it("fails with TOO_MANY_REDIRECTS after 4 redirects", async () => {
    fetchMock
      .mockResolvedValueOnce(redirect("/1"))
      .mockResolvedValueOnce(redirect("/2"))
      .mockResolvedValueOnce(redirect("/3"))
      .mockResolvedValueOnce(redirect("/4"));
    expect(await fetchImage("https://example.com/a.png", { maxBytes: 100 })).toEqual({
      ok: false,
      reason: "TOO_MANY_REDIRECTS",
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("rejects early when Content-Length exceeds maxBytes", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array(10), { status: 200, headers: { "content-length": "1000" } })
    );
    expect(await fetchImage("https://example.com/a.png", { maxBytes: 100 })).toEqual({
      ok: false,
      reason: "TOO_LARGE",
    });
  });

  it("aborts a streamed body that exceeds maxBytes", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(streamOf([new Uint8Array(60), new Uint8Array(60)]), { status: 200 })
    );
    expect(await fetchImage("https://example.com/a.png", { maxBytes: 100 })).toEqual({
      ok: false,
      reason: "TOO_LARGE",
    });
  });

  it("times out", async () => {
    fetchMock.mockImplementationOnce(
      (_url: unknown, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        })
    );
    expect(
      await fetchImage("https://example.com/a.png", { maxBytes: 100, timeoutMs: 20 })
    ).toEqual({ ok: false, reason: "TIMEOUT" });
  });

  it("returns NETWORK_ERROR when fetch throws", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await fetchImage("https://example.com/a.png", { maxBytes: 100 })).toEqual({
      ok: false,
      reason: "NETWORK_ERROR",
    });
  });

  it("returns HTTP_ERROR for non-2xx", async () => {
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 404 }));
    expect(await fetchImage("https://example.com/a.png", { maxBytes: 100 })).toEqual({
      ok: false,
      reason: "HTTP_ERROR",
    });
  });

  it("returns bytes on the happy path with manual redirect and User-Agent", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(streamOf([new Uint8Array([137, 80]), new Uint8Array([78, 71])]), {
        status: 200,
        headers: { "content-type": "image/png" },
      })
    );
    const res = await fetchImage("https://example.com/a.png", { maxBytes: 4 });
    expect(res).toEqual({
      ok: true,
      bytes: new Uint8Array([137, 80, 78, 71]),
      finalUrl: "https://example.com/a.png",
      contentType: "image/png",
    });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.redirect).toBe("manual");
    expect(init.headers).toEqual({ "User-Agent": "ScriptureJournal/1.0" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("logs host and reason but never the path or query string", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 500 }));
    await fetchImage("https://example.com/private/a.png?token=abc123", { maxBytes: 100 });
    expect(warn).toHaveBeenCalledTimes(1);
    const entry = JSON.parse(String(warn.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(entry).toEqual({
      level: "warn",
      message: "image fetch failed",
      host: "example.com",
      reason: "HTTP_ERROR",
    });
    expect(String(warn.mock.calls[0]?.[0])).not.toContain("abc123");
    expect(String(warn.mock.calls[0]?.[0])).not.toContain("/private");
  });
});
