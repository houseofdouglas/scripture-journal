import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { JournalEntrySchema } from "../../types";
import type { JournalEntry } from "../../types";
import { useAuth } from "../lib/auth-context";

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
        {entry.annotations.map((annotation, i) => (
          <div key={i} className="rounded-md border border-gray-100 bg-gray-50 p-4">
            <div className="mb-1 text-xs text-gray-400">
              Block {annotation.blockId} ·{" "}
              {new Date(annotation.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
            <p className="text-sm text-gray-800 font-sans">{annotation.text}</p>
          </div>
        ))}
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
