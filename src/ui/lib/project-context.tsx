import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";

const ACTIVE_PROJECT_KEY = "activeProjectId";

interface ProjectContextValue {
  activeProjectId: string;
  setActiveProject: (id: string) => void;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [activeProjectId, setActiveProjectIdState] = useState<string>(
    () => localStorage.getItem(ACTIVE_PROJECT_KEY) ?? "personal"
  );

  const setActiveProject = useCallback((id: string) => {
    localStorage.setItem(ACTIVE_PROJECT_KEY, id);
    setActiveProjectIdState(id);
  }, []);

  return (
    <ProjectContext.Provider value={{ activeProjectId, setActiveProject }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used within ProjectProvider");
  return ctx;
}
