import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { readFileSync } from "fs";
import path from "path";
import { JSDOM, VirtualConsole } from "jsdom";
import { articleHashParts, computeArticleId } from "../hash";
import { selectContentRoot } from "../content-root";
import { extractBlocks, type ExtractedBlock } from "../blocks";
import { assetKey, type FigurePayload } from "../../../types/article";

const sha = (s: string): string => crypto.createHash("sha256").update(s).digest("hex");
const FIXTURES = path.resolve(__dirname, "../../__tests__/fixtures");

const S1 = "a".repeat(64);
const S2 = "b".repeat(64);

function figure(caption: string, assetSha: string | null): ExtractedBlock {
  const payload: FigurePayload =
    assetSha === null
      ? { assetKey: null, format: null, width: null, height: null, alt: "", caption, unavailable: true }
      : { assetKey: assetKey(assetSha, "png"), format: "png", width: 3, height: 2, alt: "", caption };
  return { kind: "figure", text: caption || "Figure", figure: payload };
}

describe("computeArticleId", () => {
  it("text-only blocks hash exactly as the legacy texts.join('\\n\\n')", () => {
    const texts = ["First.", "Second paragraph.", "Third — with ünïcode & entities."];
    expect(computeArticleId(texts.map((text) => ({ text })))).toBe(sha(texts.join("\n\n")));
  });

  it("is lowercase 64-char hex", () => {
    expect(computeArticleId([{ text: "x" }])).toMatch(/^[0-9a-f]{64}$/);
  });

  it("structured kinds contribute only their flattened text", () => {
    const blocks: ExtractedBlock[] = [
      { kind: "heading", text: "Title", heading: { level: 2 } },
      { kind: "code", text: "let x = 1;", code: { language: "js", content: "let x = 1;" } },
    ];
    expect(computeArticleId(blocks)).toBe(sha("Title\n\nlet x = 1;"));
  });

  it("a figure adds figure:<sha> immediately after its own text part", () => {
    const blocks = [{ text: "A" }, figure("Cap", S1), { text: "B" }];
    expect(articleHashParts(blocks)).toEqual(["A", "Cap", `figure:${S1}`, "B"]);
    expect(computeArticleId(blocks)).toBe(sha(`A\n\nCap\n\nfigure:${S1}\n\nB`));
  });

  it("an unavailable figure adds figure:unavailable", () => {
    expect(articleHashParts([figure("", null)])).toEqual(["Figure", "figure:unavailable"]);
  });

  it("a changed diagram, or a figure becoming unavailable, changes the id", () => {
    const ids = new Set([
      computeArticleId([{ text: "A" }, figure("Cap", S1)]),
      computeArticleId([{ text: "A" }, figure("Cap", S2)]),
      computeArticleId([{ text: "A" }, figure("Cap", null)]),
      computeArticleId([{ text: "A" }, { text: "Cap" }]),
    ]);
    expect(ids.size).toBe(4);
  });

  it("p-only fixture matches the baseline id", () => {
    const html = readFileSync(path.join(FIXTURES, "html", "p-only.html"), "utf8");
    const baseline = JSON.parse(readFileSync(path.join(FIXTURES, "baseline-ids.json"), "utf8")) as Record<string, string>;
    const doc = new JSDOM(html, { virtualConsole: new VirtualConsole() }).window.document;
    const blocks = extractBlocks(selectContentRoot(doc)) as ExtractedBlock[];
    expect(computeArticleId(blocks)).toBe(baseline["p-only.html"]);
  });
});
