import { z } from "zod";

export const ProjectSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1),
  createdAt: z.string().datetime(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const ProjectsIndexSchema = z.object({
  projects: z.array(ProjectSchema),
});
export type ProjectsIndex = z.infer<typeof ProjectsIndexSchema>;

// ── API schemas ───────────────────────────────────────────────────────────────

export const CreateProjectRequestSchema = z.object({
  name: z.string().min(1).max(80).trim(),
});
export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>;

export const ProjectsResponseSchema = z.object({
  projects: z.array(ProjectSchema),
});
export type ProjectsResponse = z.infer<typeof ProjectsResponseSchema>;
