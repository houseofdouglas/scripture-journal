import { useQuery } from "@tanstack/react-query";
import { getScriptureManifest, getScriptureChapter } from "../../../repository/scripture";
import type { WorkSlug } from "../../../types";

export function useManifest() {
  return useQuery({
    queryKey: ["scripture", "manifest"],
    queryFn: getScriptureManifest,
    staleTime: Infinity, // manifest is immutable once ingested
  });
}

export function useChapter(work: WorkSlug, book: string, chapter: number) {
  return useQuery({
    queryKey: ["scripture", "chapter", work, book, chapter],
    queryFn: () => getScriptureChapter(work, book, chapter),
    staleTime: Infinity, // chapter content is immutable
    enabled: Boolean(work && book && chapter),
  });
}
