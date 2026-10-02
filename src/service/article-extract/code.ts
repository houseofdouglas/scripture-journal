// Code-block extraction (spec rich-article-blocks FR-6).
//
// One block per `<pre>`. `content` is the pre's text with whitespace, tabs and
// newlines preserved exactly (syntax-highlighting spans are flattened away,
// `<br>` becomes "\n", excluded descendants such as a copy `<button>` add
// nothing); only a single trailing newline is trimmed. Whitespace-only blocks
// are dropped. Content over MAX_CODE_CHARS is truncated and flagged.

import type { BlockHandler } from "./blocks";
import { isExcluded } from "./exclusions";

export const MAX_CODE_CHARS = 20_000;

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const CDATA_SECTION_NODE = 4;

const LANGUAGE_CLASS = /^(?:language|lang)-(.*)$/i;
const VALID_LANGUAGE = /^[a-z0-9+#-]{1,20}$/;

/** Raw text of `node`'s subtree: no normalization, `<br>` → "\n", excluded subtrees skipped. */
function rawText(node: Node, parts: string[]): void {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.nodeType === TEXT_NODE || child.nodeType === CDATA_SECTION_NODE) {
      parts.push((child as CharacterData).data);
    } else if (child.nodeType === ELEMENT_NODE) {
      const el = child as Element;
      if (isExcluded(el)) continue;
      if (el.tagName.toUpperCase() === "BR") parts.push("\n");
      else rawText(el, parts);
    }
  }
}

/** First valid `language-*` / `lang-*` class on `<code>` (preferred) then `<pre>`; else null. */
function detectLanguage(pre: Element): string | null {
  const code = pre.querySelector("code");
  const candidates = [...(code ? Array.from(code.classList) : []), ...Array.from(pre.classList)];
  for (const cls of candidates) {
    const match = LANGUAGE_CLASS.exec(cls);
    if (!match) continue;
    const language = (match[1] ?? "").toLowerCase();
    if (VALID_LANGUAGE.test(language)) return language;
  }
  return null;
}

function truncate(content: string): { content: string; truncated: boolean } {
  if (content.length <= MAX_CODE_CHARS) return { content, truncated: false };
  let end = MAX_CODE_CHARS;
  // Don't split a surrogate pair.
  const last = content.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return { content: content.slice(0, end), truncated: true };
}

export const codeHandler: BlockHandler = {
  matches: (el) => el.tagName.toUpperCase() === "PRE",
  extract: (el) => {
    const parts: string[] = [];
    rawText(el, parts);
    const raw = parts.join("").replace(/\r?\n$/, "");
    if (raw.trim() === "") return [];

    const { content, truncated } = truncate(raw);
    const language = detectLanguage(el);
    return [
      {
        kind: "code",
        text: content,
        code: truncated ? { language, content, truncated: true } : { language, content },
      },
    ];
  },
};
