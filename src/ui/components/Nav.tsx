import { useState, useRef, useEffect } from "react";
import { NavLink, Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import { useProject } from "../lib/project-context";
import { useProjects, useCreateProject } from "../lib/queries/projects";

export function Nav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const newProjectInputRef = useRef<HTMLInputElement>(null);

  const { activeProjectId, setActiveProject } = useProject();
  const { data: projects = [] } = useProjects();
  const createProject = useCreateProject();

  const activeProject = projects.find((p) => p.projectId === activeProjectId) ?? {
    projectId: "personal",
    name: "Personal",
    createdAt: "",
  };

  function handleLogout() {
    setUserDropdownOpen(false);
    logout();
    navigate("/login");
  }

  function handleProjectSelect(id: string) {
    setActiveProject(id);
    setProjectDropdownOpen(false);
    setNewProjectName("");
  }

  async function handleCreateProject(e: React.FormEvent) {
    e.preventDefault();
    const name = newProjectName.trim();
    if (!name) return;
    const project = await createProject.mutateAsync(name);
    setActiveProject(project.projectId);
    setProjectDropdownOpen(false);
    setNewProjectName("");
  }

  // Focus input when the new-project form appears
  useEffect(() => {
    if (projectDropdownOpen) {
      setTimeout(() => newProjectInputRef.current?.focus(), 50);
    }
  }, [projectDropdownOpen]);

  return (
    <nav className="border-b border-gray-200 bg-white px-6 py-3 flex items-center justify-between dark:border-gray-700 dark:bg-gray-900">
      {/* Logo */}
      <Link
        to="/"
        className="text-lg font-semibold text-gray-900 hover:text-gray-700 dark:text-gray-100 dark:hover:text-gray-300"
      >
        Scripture Journal
      </Link>

      {/* Centre links */}
      <div className="flex gap-6 text-sm text-gray-700 dark:text-gray-300">
        <NavLink
          to="/scripture"
          className={({ isActive }) =>
            isActive ? "font-semibold text-gray-900 dark:text-gray-100" : "hover:text-gray-900 dark:hover:text-gray-100"
          }
        >
          Browse Scripture
        </NavLink>
        <NavLink
          to="/articles"
          end
          className={({ isActive }) =>
            isActive ? "font-semibold text-gray-900 dark:text-gray-100" : "hover:text-gray-900 dark:hover:text-gray-100"
          }
        >
          Browse Articles
        </NavLink>
        <NavLink
          to="/import"
          className={({ isActive }) =>
            isActive ? "font-semibold text-gray-900 dark:text-gray-100" : "hover:text-gray-900 dark:hover:text-gray-100"
          }
        >
          Import Article
        </NavLink>
      </div>

      {/* Right side: project switcher + user dropdown */}
      <div className="flex items-center gap-3">
        {/* Project switcher */}
        {user && (
          <div className="relative">
            <button
              onClick={() => { setProjectDropdownOpen((o) => !o); setNewProjectName(""); }}
              className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700 hover:border-gray-300 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-gray-600 dark:hover:bg-gray-700"
            >
              <span className="h-2 w-2 rounded-full bg-blue-500" aria-hidden="true" />
              {activeProject.name}
              <svg className="h-3 w-3 text-gray-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>

            {projectDropdownOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setProjectDropdownOpen(false)} aria-hidden="true" />
                <div className="absolute right-0 z-20 mt-2 w-52 origin-top-right rounded-md border border-gray-200 bg-white shadow-md dark:border-gray-700 dark:bg-gray-900">
                  {/* Project list */}
                  {projects.map((p) => (
                    <button
                      key={p.projectId}
                      onClick={() => handleProjectSelect(p.projectId)}
                      className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
                    >
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${p.projectId === activeProjectId ? "bg-blue-500" : "bg-gray-300 dark:bg-gray-600"}`}
                        aria-hidden="true"
                      />
                      <span className={p.projectId === activeProjectId ? "font-semibold" : ""}>{p.name}</span>
                    </button>
                  ))}

                  {/* New project form */}
                  <div className="border-t border-gray-100 p-2 dark:border-gray-800">
                    <form onSubmit={handleCreateProject} className="flex gap-1.5">
                      <input
                        ref={newProjectInputRef}
                        type="text"
                        placeholder="New project…"
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        className="min-w-0 flex-1 rounded border border-gray-200 px-2 py-1 text-xs text-gray-900 placeholder-gray-400 focus:border-blue-400 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
                      />
                      <button
                        type="submit"
                        disabled={!newProjectName.trim() || createProject.isPending}
                        className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40"
                      >
                        Add
                      </button>
                    </form>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* User dropdown */}
        {user && (
          <div className="relative">
            <button
              onClick={() => setUserDropdownOpen((o) => !o)}
              className="flex items-center gap-1 text-sm text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100"
              aria-haspopup="true"
              aria-expanded={userDropdownOpen}
            >
              {user.username}
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>

            {userDropdownOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setUserDropdownOpen(false)} aria-hidden="true" />
                <div className="absolute right-0 z-20 mt-2 w-44 origin-top-right rounded-md border border-gray-200 bg-white shadow-md dark:border-gray-700 dark:bg-gray-900">
                  <Link
                    to="/projects"
                    onClick={() => setUserDropdownOpen(false)}
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    Manage Projects
                  </Link>
                  <Link
                    to="/settings/appearance"
                    onClick={() => setUserDropdownOpen(false)}
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    Appearance
                  </Link>
                  <Link
                    to="/settings/password"
                    onClick={() => setUserDropdownOpen(false)}
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    Change Password
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    Log Out
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
