import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { JournalEntrySchema } from "../../types";
import type { JournalEntry } from "../../types";
import { useAuth } from "../lib/auth-context";

/** Fetch the content JSON for a given contentRef path and return a blockId→text map. */
async function fetchBlockMap(contentRef: string, contentType: "scripture" | "article"): Promise<Map<number, string>> {
  const res = await fetch(`/${contentRef}`);
  if (!res.ok) return new Map();
  const data = await res.json() as Record<string, unknown>;
  const map = new Map<number, string>();
  if (contentType === "scripture") {
    const verses = data.verses as Array<{ number: number; text: string }> | undefined;
    verses?.forEach((v) => map.set(v.number, v.text));
  } else {
    const paragraphs = data.paragraphs as Array<{ index: number; text: string }> | undefined;
    paragraphs?.forEach((p) => map.set(p.index, p.text));
  }
  return map;
}

async function fetchEntry(userId: string, entryId: string): Promise<JournalEntry | null> {
  const res = await fetch(`/users/${userId}/entries/${entryId}.json`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw = await res.json();
  return JournalEntrySchema.parse(raw);
}

export function PastEntryPage() {
  const { entryId } = useParams<{ entryId: string }>();
  const { user } = useAuth();

  const { data: entry, isLoading, isError } = useQuery({
    queryKey: ["entry", user?.userId, entryId],
    queryFn: () => fetchEntry(user!.userId, entryId!),
    enabled: Boolean(user && entryId),
  });

  const { data: blockMap } = useQuery({
    queryKey: ["blockMap", entry?.contentRef],
    queryFn: () => fetchBlockMap(entry!.contentRef, entry!.contentType),
    enabled: Boolean(entry),
    staleTime: Infinity,
  });

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-4 w-32 rounded bg-gray-200" />
        <div className="h-8 w-64 rounded bg-gray-200" />
        <div className="h-4 w-full rounded bg-gray-200" />
      </div>
    );
  }

  if (isError || !entry) {
    return (
      <div>
        <p className="text-gray-600">Entry not found.</p>
        <Link to="/" className="text-blue-600 hover:underline">← Dashboard</Link>
      </div>
    );
  }

  // Determine live content URL from contentRef
  const liveUrl = contentRefToRoute(entry.contentRef);

  const dateLabel = (() => {
    const [yStr, mStr, dStr] = entry.date.split("-");
    const y = +yStr!;
    const m = +mStr!;
    const d = +dStr!;
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  })();

  return (
    <div className="mx-auto max-w-2xl">
      {/* Past entry banner */}
      <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <strong>Past Entry</strong> — {dateLabel}
        {liveUrl && (
          <span className="ml-4">
            <Link
              to={liveUrl}
              className="font-medium text-amber-900 underline hover:no-underline"
            >
              Study Today →
            </Link>
          </span>
        )}
      </div>

      <h1 className="mb-4 text-xl font-semibold text-gray-700" style={{ fontFamily: "Georgia, serif" }}>
        {entry.contentTitle}
      </h1>

      <p className="mb-6 text-xs text-gray-400">
        {entry.annotations.length} {entry.annotations.length === 1 ? "annotation" : "annotations"}
      </p>

      {/* Annotations list */}
      <div className="space-y-4">
        {entry.annotations.map((annotation, i) => {
          const blockText = blockMap?.get(annotation.blockId);
          const blockLabel = entry.contentType === "scripture"
            ? `Verse ${annotation.blockId}`
            : `¶ ${annotation.blockId + 1}`;

          return (
            <div key={i} className="rounded-md border border-gray-100 bg-white p-4 shadow-sm">
              <div className="mb-2 text-xs text-gray-400">
                {blockLabel} ·{" "}
                {new Date(annotation.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
              {blockText && (
                <blockquote className="mb-3 border-l-2 border-gray-200 pl-3 text-sm text-gray-500 italic" style={{ fontFamily: "Georgia, serif" }}>
                  {blockText}
                </blockquote>
              )}
              <p className="text-sm text-gray-800">{annotation.text}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function contentRefToRoute(contentRef: string): string | null {
  // content/scripture/<work>/<book>/<chapter>.json → /scripture/<work>/<book>/<chapter>
  const scriptureMatch = contentRef.match(
    /^content\/scripture\/([^/]+)\/([^/]+)\/(\d+)\.json$/
  );
  if (scriptureMatch) {
    return `/scripture/${scriptureMatch[1]}/${scriptureMatch[2]}/${scriptureMatch[3]}`;
  }

  // content/articles/<articleId>.json → /articles/<articleId>
  const articleMatch = contentRef.match(/^content\/articles\/([^/]+)\.json$/);
  if (articleMatch) {
    return `/articles/${articleMatch[1]}`;
  }

  return null;
}
