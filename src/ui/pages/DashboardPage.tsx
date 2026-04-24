import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../lib/auth-context";
import { EntryCard } from "../components/EntryCard";
import { EntryDayGroup } from "../components/EntryDayGroup";
import { JournalCalendar } from "../components/JournalCalendar";
import type { UserIndex, UserIndexEntry } from "../../types";

async function fetchUserIndex(userId: string): Promise<UserIndex> {
  const res = await fetch(`/users/${userId}/index.json`);
  if (res.status === 404) return { entries: [] };
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<UserIndex>;
}

export function DashboardPage() {
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const { data: index, isLoading, isError } = useQuery({
    queryKey: ["userIndex", user?.userId],
    queryFn: () => fetchUserIndex(user!.userId),
    enabled: Boolean(user),
    staleTime: 60_000, // 1 minute
  });

  if (isLoading) return <DashboardSkeleton />;
  if (isError) return <div className="text-red-600">Failed to load your journal.</div>;

  const entries = index?.entries ?? [];

  // Collect marked days
  const markedDays = new Set(entries.map((e) => e.date));

  // Filter by selected date
  const filtered = selectedDate
    ? entries.filter((e) => e.date === selectedDate)
    : entries;

  // Group by date (entries already ordered newest-first)
  const byDate = new Map<string, UserIndexEntry[]>();
  for (const entry of filtered) {
    const list = byDate.get(entry.date) ?? [];
    list.push(entry);
    byDate.set(entry.date, list);
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_220px]">
      {/* Main journal list */}
      <div>
        <h1 className="mb-6 text-2xl font-semibold text-gray-900">My Journal</h1>

        {entries.length === 0 ? (
          <div className="py-16 text-center">
            <p className="mb-4 text-gray-500">Your journal is empty.</p>
            <div className="flex justify-center gap-4">
              <Link
                to="/scripture"
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Browse Scripture
              </Link>
              <Link
                to="/import"
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Import Article
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {Array.from(byDate.entries()).map(([date, dayEntries]) => {
              if (dayEntries.length === 1) {
                return <EntryCard key={date} entry={dayEntries[0]!} date={date} />;
              }
              return <EntryDayGroup key={date} date={date} entries={dayEntries} />;
            })}
          </div>
        )}
      </div>

      {/* Calendar sidebar */}
      {entries.length > 0 && (
        <div className="lg:pt-14">
          <JournalCalendar
            markedDays={markedDays}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
          />
        </div>
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 w-40 rounded bg-gray-200" />
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-28 rounded-lg bg-gray-200" />
      ))}
    </div>
  );
}
