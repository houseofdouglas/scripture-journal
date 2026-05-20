import crypto from "crypto";
import { getProjectsIndex, putProjectsIndex } from "../repository/project";
import type { Project } from "../types";

const PERSONAL_PROJECT: Project = {
  projectId: "personal",
  name: "Personal",
  createdAt: "2020-01-01T00:00:00.000Z",
};

/**
 * Return the user's project list, bootstrapping "Personal" on first call.
 */
export async function listProjects(userId: string): Promise<Project[]> {
  const index = await getProjectsIndex(userId);

  if (index.projects.length === 0) {
    const bootstrapped = { projects: [PERSONAL_PROJECT] };
    await putProjectsIndex(userId, bootstrapped);
    return bootstrapped.projects;
  }

  // Ensure "personal" always exists (defensive)
  if (!index.projects.some((p) => p.projectId === "personal")) {
    const withPersonal = { projects: [PERSONAL_PROJECT, ...index.projects] };
    await putProjectsIndex(userId, withPersonal);
    return withPersonal.projects;
  }

  return index.projects;
}

/**
 * Create a new project, append it to the list, and return it.
 */
export async function createProject(userId: string, name: string): Promise<Project> {
  const index = await getProjectsIndex(userId);

  const project: Project = {
    projectId: crypto.randomUUID(),
    name: name.trim(),
    createdAt: new Date().toISOString(),
  };

  await putProjectsIndex(userId, {
    projects: [...index.projects, project],
  });

  return project;
}
