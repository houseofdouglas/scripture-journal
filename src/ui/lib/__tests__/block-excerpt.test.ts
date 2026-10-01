import { describe, it, expect } from "vitest";
import { blockExcerpt } from "../block-excerpt";

describe("blockExcerpt", () => {
  it("leaves blocks without a kind unprefixed (legacy text)", () => {
    expect(blockExcerpt({ text: "Faith is a principle." })).toBe("Faith is a principle.");
  });

  it("leaves text and heading blocks unprefixed", () => {
    expect(blockExcerpt({ kind: "text", text: "Plain." })).toBe("Plain.");
    expect(blockExcerpt({ kind: "heading", text: "Introduction" })).toBe("Introduction");
  });

  it.each([
    ["list", "List: one two"],
    ["code", "Code: one two"],
    ["table", "Table: one two"],
    ["figure", "Figure: one two"],
  ] as const)("prefixes %s blocks", (kind, expected) => {
    expect(blockExcerpt({ kind, text: "one two" })).toBe(expected);
  });
});
