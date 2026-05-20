import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useProject } from "../lib/project-context";
import { useProjects, useCreateProject } from "../lib/queries/projects";

export function ProjectsPage() {
  const { activeProjectId, setActiveProject } = useProject();
  const { data: projects = [], isLoading } = useProjects();
  const createProject = useCreateProject();
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setError(null);
    try {
      const project = await createProject.mutateAsync(name);
      setActiveProject(project.projectId);
      setNewName("");
    } catch {
      setError("Could not create project. Please try again.");
    }
  }

  return (
    <div className="mx-auto mt-8 max-w-sm">
      <div className="mb-4">
        <Link to="/" className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          ← Dashboard
        </Link>
      </div>

      <h1 className="mb-2 text-2xl font-semibold text-gray-900 dark:text-gray-100">Projects</h1>
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
        Organise your study notes into separate projects.
      </p>

      {/* Project list */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      ) : (
        <ul className="mb-6 space-y-2">
          {projects.map((p) => (
            <li key={p.projectId}>
              <button
                onClick={() => setActiveProject(p.projectId)}
                className={`flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
                  p.projectId === activeProjectId
                    ? "border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-950"
                    : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-gray-600 dark:hover:bg-gray-800"
                }`}
              >
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                    p.projectId === activeProjectId ? "bg-blue-500" : "bg-gray-300 dark:bg-gray-600"
                  }`}
                />
                <span className={`text-sm font-medium ${p.projectId === activeProjectId ? "text-blue-700 dark:text-blue-300" : "text-gray-900 dark:text-gray-100"}`}>
                  {p.name}
                </span>
                {p.projectId === activeProjectId && (
                  <span className="ml-auto text-xs text-blue-500 dark:text-blue-400">Active</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Create new project */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
        <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">New project</h2>
        <form onSubmit={handleCreate} className="flex gap-2">
          <input
            type="text"
            placeholder="Project name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={80}
            className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
          />
          <button
            type="submit"
            disabled={!newName.trim() || createProject.isPending}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {createProject.isPending ? "Creating…" : "Create"}
          </button>
        </form>
        {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </div>
  );
}
