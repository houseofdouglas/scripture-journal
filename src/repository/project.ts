import { ProjectsIndexSchema } from "../types";
import type { ProjectsIndex } from "../types";
import { getObject, putObject } from "./s3-client";

function projectsKey(userId: string): string {
  return `users/${userId}/projects.json`;
}

export async function getProjectsIndex(userId: string): Promise<ProjectsIndex> {
  const result = await getObject<unknown>(projectsKey(userId));
  if (!result) return { projects: [] };
  return ProjectsIndexSchema.parse(result.data);
}

export async function putProjectsIndex(userId: string, index: ProjectsIndex): Promise<void> {
  await putObject(projectsKey(userId), index); // users/ prefix → auto no-store
}
