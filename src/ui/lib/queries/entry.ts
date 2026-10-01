import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useAuth } from "../auth-context";
import { JournalEntrySchema } from "../../../types";
import type { JournalEntry } from "../../../types";
import { log } from "../../../lib/log";

async function fetchEntry(userId: string, entryId: string): Promise<JournalEntry | null> {
  const res = await fetch(`/users/${userId}/entries/${entryId}.json`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const raw: unknown = await res.json();
  const parsed = JournalEntrySchema.safeParse(raw);
  if (!parsed.success) {
    // Log only field paths, never values — annotation text must never reach
    // the console (NFR-14).
    log.error("Failed to parse journal entry", {
      entryId,
      paths: parsed.error.issues.map((issue) => issue.path.join(".")),
    });
    throw new Error("Invalid journal entry");
  }
  return parsed.data;
}

/**
 * Shared `JournalEntry` query — used by the Past Entry view and by the
 * note-history modal on content pages, so both share one cache entry.
 */
export function useJournalEntry(entryId: string | undefined): UseQueryResult<JournalEntry | null> {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["entry", user?.userId, entryId],
    queryFn: () => fetchEntry(user!.userId, entryId!),
    enabled: Boolean(user && entryId),
  });
}
