import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { JSDOM, VirtualConsole } from "jsdom";

import { selectContentRoot } from "../content-root";
import { extractBlocks, type BlockOutput, type ExtractedBlock } from "../blocks";
import { codeHandler, MAX_CODE_CHARS } from "../code";
import { normalizeText } from "../exclusions";
import { ArticleParagraphSchema } from "../../../types/article";

const FIXTURES = path.resolve(__dirname, "../../__tests__/fixtures/html");

function parse(html: string): Document {
  return new JSDOM(html, { virtualConsole: new VirtualConsole() }).window.document;
}

function fixture(name: string): Document {
  return parse(readFileSync(path.join(FIXTURES, name), "utf8"));
}

function body(html: string): Element {
  return parse(`<!DOCTYPE html><html><body>${html}</body></html>`).body;
}

function blocks(outputs: BlockOutput[]): ExtractedBlock[] {
  return outputs.filter((o): o is ExtractedBlock => o.kind !== "pending-figure");
}

const codeBlocks = (outputs: BlockOutput[]) => blocks(outputs).filter((b) => b.kind === "code");

describe("codeHandler — reference fixture", () => {
  const doc = fixture("reference-ai-native-sdlc.html");
  const root = selectContentRoot(doc);
  const outputs = extractBlocks(root);
  const code = codeBlocks(outputs);

  it("yields exactly 13 code blocks with the expected languages, in order", () => {
    expect(code).toHaveLength(13);
    expect(code.map((b) => b.code?.language)).toEqual([
      "markdown",
      "markdown",
      "markdown",
      "javascript",
      "markdown",
      "javascript",
      "javascript",
      "yaml",
      "markdown",
      "json",
      "bash",
      "markdown",
      "yaml",
    ]);
    const counts: Record<string, number> = {};
    for (const b of code) counts[b.code!.language!] = (counts[b.code!.language!] ?? 0) + 1;
    expect(counts).toEqual({ markdown: 6, javascript: 3, yaml: 2, json: 1, bash: 1 });
  });

  it("each content equals the pre's textContent minus one trailing newline, byte-for-byte", () => {
    const pres = Array.from(root.querySelectorAll("pre"));
    expect(pres).toHaveLength(13);
    pres.forEach((pre, i) => {
      const raw = pre.textContent ?? "";
      const expected = raw.endsWith("\r\n") ? raw.slice(0, -2) : raw.endsWith("\n") ? raw.slice(0, -1) : raw;
      expect(code[i]?.code?.content).toBe(expected);
      expect(code[i]?.text).toBe(expected);
      expect(code[i]?.code?.truncated).toBeUndefined();
    });
    // Multi-line content really is preserved (not whitespace-collapsed).
    expect(code.some((b) => b.code!.content.includes("\n"))).toBe(true);
  });

  it("no non-code block contains code text", () => {
    const others = blocks(outputs).filter((b) => b.kind !== "code");
    for (const b of code) {
      const firstLine = b.code!.content.split("\n").find((l) => l.trim().length >= 12);
      const needles = [normalizeText(b.code!.content)];
      if (firstLine) needles.push(normalizeText(firstLine));
      for (const other of others) {
        for (const needle of needles) expect(other.text.includes(needle)).toBe(false);
      }
    }
  });

  it("every code block validates against ArticleParagraphSchema with an index", () => {
    code.forEach((b, index) => {
      expect(ArticleParagraphSchema.safeParse({ ...b, index }).success).toBe(true);
    });
  });
});

describe("codeHandler — code.html cases", () => {
  const doc = fixture("code.html");
  const all = extractBlocks(selectContentRoot(doc));
  const code = codeBlocks(all);
  const byId = (id: string): ExtractedBlock | undefined => {
    const pre = doc.getElementById(id)!;
    const raw = pre.textContent!.replace(/\n$/, "");
    return code.find((b) => b.code?.content === raw);
  };

  it("emits one block per non-whitespace pre, in document order, between the paragraphs", () => {
    expect(code).toHaveLength(7);
    const kinds = blocks(all).map((b) => b.kind ?? "text");
    expect(kinds).toEqual(["text", "code", "code", "code", "code", "code", "code", "code", "text"]);
  });

  it("language-* on <code>", () => {
    expect(byId("language-class")?.code?.language).toBe("typescript");
  });

  it("lang-* on <code>", () => {
    expect(byId("lang-class")?.code?.language).toBe("python");
  });

  it("language class on <pre>", () => {
    expect(byId("lang-on-pre")?.code?.language).toBe("json");
  });

  it("pre without <code> is still a code block, language null", () => {
    const b = byId("no-code-element");
    expect(b?.code).toEqual({
      language: null,
      content: "plain preformatted text\n  with two-space indentation\nand no code element",
    });
  });

  it("garbage class → null language", () => {
    expect(byId("garbage-class")?.code).toEqual({ language: null, content: "x = 1" });
  });

  it("whitespace-only pre is skipped", () => {
    expect(codeHandler.extract(doc.getElementById("whitespace-only")!, null as never)).toEqual([]);
  });

  it("leading indentation and tabs preserved exactly", () => {
    expect(byId("indentation-tabs")?.code).toEqual({
      language: "go",
      content: 'func main() {\n\tif true {\n\t\tfmt.Println("tabs")\n\t}\n    // four spaces\n}',
    });
  });

  it("escaped <script> text is kept literally", () => {
    const b = byId("script-text");
    expect(b?.code?.language).toBe("html");
    expect(b?.code?.content).toBe('<script>alert(1)</script>\n<p onclick="evil()">text</p>');
  });

  it("all blocks validate against ArticleParagraphSchema with an index", () => {
    blocks(all).forEach((b, index) => {
      expect(ArticleParagraphSchema.safeParse({ ...b, index }).success).toBe(true);
    });
  });
});

describe("codeHandler — synthetic cases", () => {
  const one = (html: string) => codeBlocks(extractBlocks(body(html)));

  it("highlight spans are flattened; only one trailing newline trimmed", () => {
    const [b] = one(`<pre><code><span class="k">const</span> x = <span>1</span>;\n\n</code></pre>`);
    expect(b?.code?.content).toBe("const x = 1;\n");
  });

  it("trims a single trailing CRLF", () => {
    const el = body("<pre></pre>").querySelector("pre")!;
    el.textContent = "a\r\nb\r\n";
    expect(codeBlocks(extractBlocks(el.parentElement!))[0]?.code?.content).toBe("a\r\nb");
  });

  it("<br> inside pre becomes a newline", () => {
    const [b] = one(`<pre><code>line1<br>line2<br/>line3</code></pre>`);
    expect(b?.code?.content).toBe("line1\nline2\nline3");
  });

  it("excluded descendants (copy button, aria-hidden) contribute nothing", () => {
    const [b] = one(`<pre><button>Copy</button><span aria-hidden="true">1</span><code>ok()</code></pre>`);
    expect(b?.code?.content).toBe("ok()");
  });

  it("language is lowercased; <code> class preferred over <pre>", () => {
    expect(one(`<pre class="lang-Ruby"><code class="language-C++">x</code></pre>`)[0]?.code?.language).toBe("c++");
    expect(one(`<pre class="language-CSharp"><code>x</code></pre>`)[0]?.code?.language).toBe("csharp");
  });

  it("invalid languages → null", () => {
    expect(one(`<pre><code class="language-${"a".repeat(21)}">x</code></pre>`)[0]?.code?.language).toBeNull();
    expect(one(`<pre><code class="language-a_b">x</code></pre>`)[0]?.code?.language).toBeNull();
    expect(one(`<pre><code class="hljs">x</code></pre>`)[0]?.code?.language).toBeNull();
  });

  it("20,001-char block is truncated to 20,000 with truncated: true", () => {
    const [b] = one(`<pre><code>${"x".repeat(MAX_CODE_CHARS + 1)}</code></pre>`);
    expect(b?.code?.content).toHaveLength(MAX_CODE_CHARS);
    expect(b?.code?.truncated).toBe(true);
    expect(b?.text).toBe(b?.code?.content);
    expect(ArticleParagraphSchema.safeParse({ ...b, index: 0 }).success).toBe(true);
  });

  it("exactly 20,000 chars is not truncated (truncated omitted)", () => {
    const [b] = one(`<pre>${"y".repeat(MAX_CODE_CHARS)}</pre>`);
    expect(b?.code?.content).toHaveLength(MAX_CODE_CHARS);
    expect(b?.code && "truncated" in b.code).toBe(false);
  });

  it("<p> inside pre is not emitted separately", () => {
    const out = blocks(extractBlocks(body(`<pre><p>inner</p></pre>`)));
    expect(out).toEqual([{ kind: "code", text: "inner", code: { language: null, content: "inner" } }]);
  });
});
