import { readFileSync } from "fs";
import { join } from "path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { sanitizeSvg } from "../svg-sanitize";

const IMAGES = join(__dirname, "../../__tests__/fixtures/images");
const fixture = (name: string): string => readFileSync(join(IMAGES, name), "utf8");

const XLINK = 'xmlns:xlink="http://www.w3.org/1999/xlink"';
const RECT = '<rect width="10" height="10" fill="#000"/>';

/** Parses sanitizer output as standalone XML, as an `<img>` would. */
function parseXml(xml: string): Document {
  const doc = new JSDOM(xml, { contentType: "image/svg+xml" }).window.document;
  expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
  return doc;
}

function mustSanitize(input: string): string {
  const out = sanitizeSvg(input);
  expect(out).not.toBeNull();
  return out!;
}

describe("sanitizeSvg — fixtures", () => {
  it("strips every attack vector from malicious.svg and keeps the benign rect", () => {
    const out = mustSanitize(fixture("malicious.svg"));
    for (const bad of ["<script", "onload", "onclick", "foreignObject", "iframe", "evil.example", "@import", "alert("]) {
      expect(out).not.toContain(bad);
    }
    const doc = parseXml(out);
    const benign = doc.getElementById("benign");
    expect(benign?.localName).toBe("rect");
    expect(benign?.getAttribute("fill")).toBe("#d97757");
    // The safe part of the <style> survives.
    expect(out).toContain("fill: #6a9bcc");
  });

  it("keeps the shapes, text, gradient, marker and internal <use> of benign-diagram.svg", () => {
    const out = mustSanitize(fixture("benign-diagram.svg"));
    const doc = parseXml(out);
    expect(doc.getElementsByTagName("rect")).toHaveLength(3);
    expect(doc.getElementsByTagName("line")).toHaveLength(2);
    const texts = Array.from(doc.getElementsByTagName("text")).map((t) => t.textContent);
    expect(texts).toEqual(["Spec", "Plan", "Build"]);
    expect(out).toContain('fill="url(#grad)"');
    expect(out).toContain('marker-end="url(#arrow)"');
    expect(doc.getElementsByTagName("linearGradient")).toHaveLength(1);
    expect(doc.getElementsByTagName("use")[0]?.getAttribute("href")).toBe("#dot");
  });

  it("writes width/height from the viewBox of wide-viewbox.svg", () => {
    const root = parseXml(mustSanitize(fixture("wide-viewbox.svg"))).documentElement;
    expect(root.getAttribute("width")).toBe("2400");
    expect(root.getAttribute("height")).toBe("600");
    expect(root.getAttribute("viewBox")).toBe("0 0 2400 600");
  });

  it("returns null for external-use.svg (nothing drawable remains)", () => {
    expect(sanitizeSvg(fixture("external-use.svg"))).toBeNull();
  });

  it("leaves unsizeable.svg sizes alone (dimension reader decides availability)", () => {
    const root = parseXml(mustSanitize(fixture("unsizeable.svg"))).documentElement;
    expect(root.getAttribute("width")).toBe("100%");
    expect(root.getAttribute("height")).toBe("5em");
  });
});

describe("sanitizeSvg — root and parsing", () => {
  it.each([
    ["empty", ""],
    ["plain text", "hello world"],
    ["HTML", "<div><p>not svg</p></div>"],
    ["svg wrapped in HTML", `<div><svg>${RECT}</svg></div>`],
    ["two svg roots", `<svg>${RECT}</svg><svg>${RECT}</svg>`],
    ["text beside svg", `junk<svg>${RECT}</svg>`],
    ["math root", "<math><mi>x</mi></math>"],
  ])("returns null for non-SVG input (%s)", (_label, input) => {
    expect(sanitizeSvg(input)).toBeNull();
  });

  it("adds xmlns when missing and accepts an XML prolog", () => {
    const out = mustSanitize(`<?xml version="1.0" encoding="UTF-8"?>\n<svg width="10" height="10">${RECT}</svg>`);
    expect(out.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    parseXml(out);
  });

  it("declares xmlns:xlink when xlink attributes remain", () => {
    const out = mustSanitize(`<svg width="10" height="10"><rect id="r" width="1" height="1"/><use xlink:href="#r"/></svg>`);
    expect(out).toContain('xmlns:xlink="http://www.w3.org/1999/xlink"');
    expect(out).toContain('xlink:href="#r"');
    parseXml(out);
  });

  it("ceils fractional viewBox dimensions and replaces non-absolute sizes", () => {
    const root = parseXml(
      mustSanitize(`<svg width="100%" viewBox="0 0 10.2 4.1">${RECT}</svg>`),
    ).documentElement;
    expect(root.getAttribute("width")).toBe("11");
    expect(root.getAttribute("height")).toBe("5");
  });

  it("keeps absolute width/height as given", () => {
    const root = parseXml(mustSanitize(`<svg width="300px" height="100" viewBox="0 0 30 10">${RECT}</svg>`)).documentElement;
    expect(root.getAttribute("width")).toBe("300px");
    expect(root.getAttribute("height")).toBe("100");
  });
});

describe("sanitizeSvg — drawable check", () => {
  it("returns null when only non-rendered shapes exist", () => {
    expect(sanitizeSvg(`<svg width="10" height="10"><defs>${RECT}</defs></svg>`)).toBeNull();
  });

  it("returns null for empty text and an <image> without a data URI", () => {
    expect(sanitizeSvg('<svg width="10" height="10"><text> </text><image href="https://x.example/a.png"/></svg>')).toBeNull();
  });

  it("accepts an internal <use> pointing at a defined shape", () => {
    expect(sanitizeSvg(`<svg width="10" height="10"><defs><rect id="a" width="1" height="1"/></defs><use href="#a"/></svg>`)).not.toBeNull();
  });

  it("returns null for <use> pointing at a missing id or at itself", () => {
    expect(sanitizeSvg('<svg width="10" height="10"><use href="#missing"/></svg>')).toBeNull();
    expect(sanitizeSvg('<svg width="10" height="10"><use id="u" href="#u"/></svg>')).toBeNull();
  });

  it("returns null when the only content was a script", () => {
    expect(sanitizeSvg('<svg width="10" height="10"><script>alert(1)</script></svg>')).toBeNull();
  });
});

describe("sanitizeSvg — href rules", () => {
  it("keeps a base64 raster data URI and removes data:text/html", () => {
    const out = mustSanitize(
      `<svg ${XLINK} width="10" height="10">` +
        '<image id="ok" xlink:href="data:image/png;base64,iVBORw0KGgo=" width="1" height="1"/>' +
        '<image id="bad" href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==" width="1" height="1"/>' +
        '<image id="svgdata" href="data:image/svg+xml;base64,PHN2Zy8+" width="1" height="1"/>' +
        "</svg>",
    );
    const doc = parseXml(out);
    expect(doc.getElementById("ok")?.getAttributeNS("http://www.w3.org/1999/xlink", "href")).toBe(
      "data:image/png;base64,iVBORw0KGgo=",
    );
    expect(out).not.toContain("data:text/html");
    expect(out).not.toContain("data:image/svg+xml");
  });

  it.each([
    ["javascript:", '<a href="javascript:alert(1)">'],
    ["javascript: (xlink)", `<a xlink:href="javascript:alert(1)">`],
    ["obfuscated javascript:", '<a href=" jav&#x09;ascript:alert(1)">'],
    ["https", '<a href="https://evil.example/">'],
    ["relative", '<a href="other.svg#x">'],
  ])("removes a %s href", (_label, open) => {
    const out = mustSanitize(`<svg ${XLINK} width="10" height="10">${open}${RECT}</a></svg>`);
    expect(out).not.toMatch(/href=/);
    expect(out).not.toContain("javascript");
    expect(out).not.toContain("evil.example");
  });

  it("removes animations that target href, and forbids <set>/<animate>", () => {
    const out = mustSanitize(
      `<svg ${XLINK} width="10" height="10"><a href="#x">${RECT}` +
        '<set attributeName="href" to="javascript:alert(1)"/>' +
        '<animate attributeName="xlink:href" values="javascript:alert(1)"/>' +
        '<animateTransform attributeName="href" values="javascript:alert(2)"/>' +
        '<animateMotion attributeName="xlink:href" values="javascript:alert(3)"/>' +
        '</a><rect id="spin" width="1" height="1"><animateTransform attributeName="transform" type="rotate" from="0" to="90" dur="1s"/></rect></svg>',
    );
    expect(out).not.toContain("javascript");
    expect(out).not.toMatch(/<set|<animate |<animate\/|<animateMotion/);
    // A benign transform animation is retained.
    expect(out).toContain('attributeName="transform"');
  });
});

describe("sanitizeSvg — CSS", () => {
  it("keeps url(#id) and strips url(https://…) in presentation attributes", () => {
    const out = mustSanitize(
      '<svg width="10" height="10">' +
        '<rect id="a" width="1" height="1" fill="url(#grad)" filter="url(https://evil.example/f.svg#x)"/>' +
        "<rect id=\"b\" width=\"1\" height=\"1\" mask=\"url('https://evil.example/m')\" clip-path=\"url( #clip )\" marker-start=\"url(//evil.example/m)\"/>" +
        "</svg>",
    );
    expect(out).not.toContain("evil.example");
    const doc = parseXml(out);
    expect(doc.getElementById("a")?.getAttribute("fill")).toBe("url(#grad)");
    expect(doc.getElementById("b")?.getAttribute("clip-path")).toBe("url(#clip)");
  });

  it("cleans <style> bodies: @import removed, url(#id) kept, external url() stripped", () => {
    const out = mustSanitize(
      '<svg width="10" height="10"><style>' +
        "@import 'https://evil.example/a.css';" +
        "@IMPORT url(https://evil.example/b.css) screen;" +
        ".a { fill: url(#grad); } .b { background: URL( \"https://evil.example/c\" ); }" +
        "@font-face { font-family: x; src: url(https://evil.example/f.woff); }" +
        `</style>${RECT}</svg>`,
    );
    expect(out).not.toContain("evil.example");
    expect(out.toLowerCase()).not.toContain("@import");
    expect(out).toContain(".a { fill: url(#grad); }");
  });

  it("strips url(https://…) from style attributes", () => {
    const out = mustSanitize(
      '<svg width="10" height="10"><g style="fill: url(#ok); background:url(https://evil.example/y)">' +
        `${RECT}</g></svg>`,
    );
    expect(out).not.toContain("evil.example");
    expect(out).toContain("fill: url(#ok)");
  });

  it("drops CSS that uses escapes or string-fetching functions", () => {
    const out = mustSanitize(
      '<svg width="10" height="10">' +
        "<style>.a { background: \\75 rl(https://evil.example/esc); }</style>" +
        '<g id="g1" style="background: image-set(&quot;https://evil.example/i.png&quot; 1x)">' +
        '<rect id="r" width="1" height="1" fill="\\75 rl(https://evil.example/p)"/></g></svg>',
    );
    expect(out).not.toContain("evil.example");
    const doc = parseXml(out);
    expect(doc.getElementsByTagName("style")).toHaveLength(0);
    expect(doc.getElementById("g1")?.hasAttribute("style")).toBe(false);
    expect(doc.getElementById("r")?.hasAttribute("fill")).toBe(false);
  });

  it("does not let comments hide an @import", () => {
    const out = mustSanitize(
      `<svg width="10" height="10"><style>/* x */@import url(https://evil.example/a.css);/* y</style>${RECT}</svg>`,
    );
    expect(out).not.toContain("evil.example");
  });
});

describe("sanitizeSvg — removed elements and attributes", () => {
  it("removes on* handlers, iframe/embed/object and foreignObject", () => {
    const out = mustSanitize(
      '<svg width="10" height="10" onload="x()" ONMOUSEOVER="y()">' +
        '<rect width="1" height="1" onclick="z()" onfocusin="w()"/>' +
        '<foreignObject width="5" height="5"><iframe src="https://evil.example/"></iframe>' +
        '<embed src="https://evil.example/"/><object data="https://evil.example/"></object>hidden</foreignObject>' +
        "<iframe></iframe><object></object>" +
        "</svg>",
    );
    expect(out.toLowerCase()).not.toMatch(/\son[a-z]+=/);
    for (const bad of ["foreignObject", "iframe", "embed", "object", "evil.example", "hidden"]) {
      expect(out).not.toContain(bad);
    }
  });

  it("fails closed when an HTML breakout tag escapes the <svg> root", () => {
    // `<embed>` directly in SVG content closes the <svg> under HTML parsing,
    // leaving two top-level nodes.
    expect(sanitizeSvg(`<svg width="10" height="10">${RECT}<embed src="https://evil.example/"/></svg>`)).toBeNull();
  });
});
