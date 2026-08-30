import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useAuth } from "../auth-context";
import type { UserIndex } from "../../../types";

async function fetchUserIndex(userId: string): Promise<UserIndex> {
  const res = await fetch(`/users/${userId}/index.json`);
  if (res.status === 404) return { entries: [] };
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<UserIndex>;
}

/**
 * Shared `UserIndex` query — used by the Dashboard and by the note-history
 * rail on content pages, so both share one cache entry and one network
 * request within the `staleTime` window.
 */
export function useUserIndex(): UseQueryResult<UserIndex> {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["userIndex", user?.userId],
    queryFn: () => fetchUserIndex(user!.userId),
    enabled: Boolean(user),
    staleTime: 60_000,
  });
}
