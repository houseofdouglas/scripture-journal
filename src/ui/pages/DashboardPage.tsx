import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../lib/auth-context";
import { useProject } from "../lib/project-context";
import { useProjects } from "../lib/queries/projects";
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
  const { activeProjectId, setActiveProject } = useProject();
  const { data: projects = [] } = useProjects();

  // "all" shows every entry; otherwise filtered by projectId
  const [projectFilter, setProjectFilter] = useState<string | "all">("all");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const { data: index, isLoading, isError } = useQuery({
    queryKey: ["userIndex", user?.userId],
    queryFn: () => fetchUserIndex(user!.userId),
    enabled: Boolean(user),
    staleTime: 60_000,
  });

  if (isLoading) return <DashboardSkeleton />;
  if (isError) return <div className="text-red-600 dark:text-red-400">Failed to load your journal.</div>;

  const allEntries = index?.entries ?? [];
  const markedDays = new Set(allEntries.map((e) => e.date));

  // Apply project filter then date filter
  const projectFiltered =
    projectFilter === "all"
      ? allEntries
      : allEntries.filter((e) => (e.projectId ?? "personal") === projectFilter);

  const filtered = selectedDate
    ? projectFiltered.filter((e) => e.date === selectedDate)
    : projectFiltered;

  const byDate = new Map<string, UserIndexEntry[]>();
  for (const entry of filtered) {
    const list = byDate.get(entry.date) ?? [];
    list.push(entry);
    byDate.set(entry.date, list);
  }

  function handleProjectTab(id: string | "all") {
    setProjectFilter(id);
    setSelectedDate(null);
    if (id !== "all") setActiveProject(id); // also updates active project for new notes
  }

  const showProjectBadge = projectFilter === "all" && projects.length > 1;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_220px]">
      <div>
        <h1 className="mb-4 text-2xl font-semibold text-gray-900 dark:text-gray-100">My Journal</h1>

        {/* Project filter tabs */}
        {projects.length > 0 && (
          <div className="mb-6 flex flex-wrap gap-2">
            <TabPill
              label="All"
              active={projectFilter === "all"}
              onClick={() => handleProjectTab("all")}
            />
            {projects.map((p) => (
              <TabPill
                key={p.projectId}
                label={p.name}
                active={projectFilter === p.projectId}
                isActiveProject={p.projectId === activeProjectId}
                onClick={() => handleProjectTab(p.projectId)}
              />
            ))}
            <Link
              to="/projects"
              className="rounded-full border border-dashed border-gray-300 px-3 py-1 text-xs text-gray-400 hover:border-gray-400 hover:text-gray-600 dark:border-gray-600 dark:text-gray-500 dark:hover:border-gray-500 dark:hover:text-gray-300"
            >
              + New project
            </Link>
          </div>
        )}

        {allEntries.length === 0 ? (
          <div className="py-16 text-center">
            <p className="mb-4 text-gray-500 dark:text-gray-400">Your journal is empty.</p>
            <div className="flex justify-center gap-4">
              <Link to="/scripture" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                Browse Scripture
              </Link>
              <Link
                to="/import"
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Import Article
              </Link>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-gray-500 dark:text-gray-400">
            No entries in this project yet.
          </p>
        ) : (
          <div className="space-y-4">
            {Array.from(byDate.entries()).map(([date, dayEntries]) => {
              if (dayEntries.length === 1) {
                return (
                  <EntryCard
                    key={date}
                    entry={dayEntries[0]!}
                    date={date}
                    showProject={showProjectBadge ? projects : undefined}
                  />
                );
              }
              return (
                <EntryDayGroup
                  key={date}
                  date={date}
                  entries={dayEntries}
                  showProject={showProjectBadge ? projects : undefined}
                />
              );
            })}
          </div>
        )}
      </div>

      {allEntries.length > 0 && (
        <div className="lg:pt-[4.5rem]">
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

function TabPill({
  label,
  active,
  isActiveProject,
  onClick,
}: {
  label: string;
  active: boolean;
  isActiveProject?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-blue-600 text-white"
          : "border border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:bg-gray-800"
      }`}
    >
      {isActiveProject && !active && (
        <span className="h-1.5 w-1.5 rounded-full bg-blue-400" aria-label="active project" />
      )}
      {label}
    </button>
  );
}

function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 w-40 rounded bg-gray-200 dark:bg-gray-700" />
      <div className="flex gap-2">
        {[1, 2, 3].map((i) => <div key={i} className="h-6 w-20 rounded-full bg-gray-200 dark:bg-gray-700" />)}
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-28 rounded-lg bg-gray-200 dark:bg-gray-700" />
      ))}
    </div>
  );
}
