import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

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

    // Estimate line height from the median non-zero height
    const heights = lines.map((l) => l.height).filter((h) => h > 0).sort((a, b) => a - b);
    const medianHeight = heights[Math.floor(heights.length / 2)] ?? 12;
    const paraGap = medianHeight * 1.4;

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
