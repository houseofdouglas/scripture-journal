import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { JSDOM, VirtualConsole } from "jsdom";

import { selectContentRoot, MIN_CONTENT_ROOT_SCORE } from "../content-root";

const FIXTURES = path.resolve(__dirname, "../../__tests__/fixtures/html");

// Silence jsdom's "Could not parse CSS stylesheet" noise (talk.html).
function parse(html: string): Document {
  const virtualConsole = new VirtualConsole();
  return new JSDOM(html, { virtualConsole }).window.document;
}

function fixture(name: string): Document {
  return parse(readFileSync(path.join(FIXTURES, name), "utf8"));
}

const para = (n: number, ch = "a") => `<p>${ch.repeat(n)}</p>`;

describe("selectContentRoot", () => {
  it("exports the 500-char threshold", () => {
    expect(MIN_CONTENT_ROOT_SCORE).toBe(500);
  });

  it("picks the rich-text body on the reference article", () => {
    const doc = fixture("reference-ai-native-sdlc.html");
    const root = selectContentRoot(doc);

    expect(root.tagName).toBe("DIV");
    expect(root.classList.contains("u-rich-text-blog")).toBe(true);
    expect(root.classList.contains("w-richtext")).toBe(true);
    expect(root.getAttribute("data-readtime")).toBe("content");
    expect(root).toBe(doc.querySelector('[data-readtime="content"]'));

    expect(root.querySelectorAll("h2")).toHaveLength(10);
    const text = root.textContent ?? "";
    const pageText = doc.body.textContent ?? "";
    for (const chrome of ["Copy link", "Related posts", "Reading time"]) {
      expect(pageText).toContain(chrome);
      expect(text).not.toContain(chrome);
    }
  });

  it("uses .body-block on the talk fixture", () => {
    const doc = fixture("talk.html");
    const root = selectContentRoot(doc);
    expect(root).toBe(doc.querySelector(".body-block"));
  });

  it("prefers .body-block even when a denser container exists", () => {
    const doc = parse(
      `<main><div class="body-block">${para(10)}</div><div>${para(2000)}</div></main>`,
    );
    expect(selectContentRoot(doc).className).toBe("body-block");
  });

  it("falls back to <main> on a sparse page", () => {
    const doc = parse(
      `<body><header>${para(800, "h")}</header><main><div>${para(100)}${para(100)}</div><section>${para(200)}</section></main></body>`,
    );
    expect(selectContentRoot(doc).tagName).toBe("MAIN");
  });

  it("falls back when the best score is just under the threshold", () => {
    const doc = parse(`<main><div id="d">${para(499)}</div></main>`);
    expect(selectContentRoot(doc).tagName).toBe("MAIN");
  });

  it("accepts a container scoring exactly the threshold", () => {
    const doc = parse(`<main><div id="d">${para(250)}${para(250)}</div></main>`);
    expect(selectContentRoot(doc).id).toBe("d");
  });

  it("scores only direct block children, using trimmed text", () => {
    // #outer's direct child is a div, so it scores 0; #inner holds the text.
    const doc = parse(
      `<main><div id="outer"><div id="inner"><p>   ${"x".repeat(600)}   </p><span>${"y".repeat(5000)}</span></div></div></main>`,
    );
    expect(selectContentRoot(doc).id).toBe("inner");
  });

  it("counts every listed block tag", () => {
    const doc = parse(
      `<main><div id="d"><h1>${"a".repeat(50)}</h1><h6>${"a".repeat(50)}</h6><ul><li>${"a".repeat(80)}</li></ul><ol><li>${"a".repeat(80)}</li></ol><pre>${"a".repeat(80)}</pre><table><tr><td>${"a".repeat(80)}</td></tr></table><figure>${"a".repeat(40)}</figure><blockquote>${"a".repeat(40)}</blockquote></div></main>`,
    );
    expect(selectContentRoot(doc).id).toBe("d");
  });

  it("breaks ties in favour of the outermost element", () => {
    // #outer: one direct <blockquote> (600). #inner (inside the blockquote):
    // one direct <p> (600). Equal scores — the ancestor wins.
    const doc = parse(
      `<main><section id="outer"><blockquote><div id="inner">${para(600)}</div></blockquote></section></main>`,
    );
    expect(selectContentRoot(doc).id).toBe("outer");
  });

  it("breaks ties between siblings by document order", () => {
    const doc = parse(
      `<main><div id="first">${para(600)}</div><div id="second">${para(600)}</div></main>`,
    );
    expect(selectContentRoot(doc).id).toBe("first");
  });

  it("prefers <article> over <main> as the fallback scope", () => {
    const doc = parse(
      `<main><div id="outside">${para(5000)}</div><article><div id="inside">${para(700)}</div></article></main>`,
    );
    expect(selectContentRoot(doc).id).toBe("inside");
  });

  it("can select the fallback element itself", () => {
    const doc = parse(`<article id="a">${para(600)}<div>${para(100)}</div></article>`);
    expect(selectContentRoot(doc).id).toBe("a");
  });

  it("selects within <body> when there is no <main> or <article>", () => {
    const doc = parse(
      `<body><nav>${para(50)}</nav><div class="wrap"><div id="content">${para(400)}${para(400)}</div></div><footer>${para(50)}</footer></body>`,
    );
    expect(selectContentRoot(doc).id).toBe("content");
  });

  it("returns <body> when a body-only page is sparse", () => {
    const doc = parse(`<body><div>${para(100)}</div></body>`);
    expect(selectContentRoot(doc)).toBe(doc.body);
  });
});
