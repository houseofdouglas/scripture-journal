import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

// pdfjs-dist's getTextContent() consumes a ReadableStream via `for await...of`,
// which needs ReadableStream.prototype[Symbol.asyncIterator]. Some Safari
// builds still lack it, throwing "undefined is not a function" deep inside
// the library. Polyfill it up front rather than depend on the OS/browser.
if (typeof ReadableStream !== "undefined" && !(ReadableStream.prototype as any)[Symbol.asyncIterator]) {
  (ReadableStream.prototype as any)[Symbol.asyncIterator] = async function* (this: ReadableStream) {
    const reader = this.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  };
}

interface PdfTextItem {
  str: string;
  height: number;
  transform: number[];
}

export async function extractPdfText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const allParagraphs: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const { items } = await page.getTextContent();

    // Group text items into lines by rounded Y position (baseline)
    const lineMap = new Map<number, { y: number; height: number; texts: string[] }>();
    for (const raw of items) {
      if (!("str" in raw) || !raw.str) continue;
      const item = raw as unknown as PdfTextItem;
      const y = Math.round(item.transform[5]!);
      const existing = lineMap.get(y);
      if (existing) {
        existing.texts.push(item.str);
      } else {
        lineMap.set(y, { y, height: item.height, texts: [item.str] });
      }
    }

    // Sort lines top-to-bottom (PDF Y increases upward, so descending order)
    const lines = Array.from(lineMap.values()).sort((a, b) => b.y - a.y);
    if (lines.length === 0) continue;

    // Estimate normal line-to-line spacing from the median gap between consecutive
    // lines. This tracks actual leading (which varies by document/font and is often
    // looser than the glyph height itself), unlike a glyph-height-based estimate,
    // which under-detects paragraph continuations in documents with generous leading.
    const gaps = lines.slice(1).map((line, i) => lines[i]!.y - line.y).filter((g) => g > 0).sort((a, b) => a - b);
    const medianGap = gaps[Math.floor(gaps.length / 2)] ?? 12;
    const paraGap = medianGap * 1.5;

    // Group consecutive lines into paragraphs based on vertical gap
    const pageParagraphs: string[][] = [[]];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const lineText = line.texts.join("").trim();
      if (!lineText) continue;

      if (i > 0) {
        const prev = lines[i - 1]!;
        if (prev.y - line.y > paraGap) {
          pageParagraphs.push([]);
        }
      }
      pageParagraphs[pageParagraphs.length - 1]!.push(lineText);
    }

    for (const paraLines of pageParagraphs) {
      const text = paraLines.join(" ").trim();
      if (text) allParagraphs.push(text);
    }
  }

  return allParagraphs.join("\n\n");
}
