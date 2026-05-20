import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../api-client";
import type { Project, ProjectsResponse } from "../../../types";

async function fetchProjects(): Promise<Project[]> {
  const res = await fetch("/api/projects");
  if (res.status === 401) return []; // not yet logged in
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as ProjectsResponse;
  return data.projects;
}

export function useProjects() {
  return useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: fetchProjects,
    staleTime: 5 * 60_000,
    placeholderData: [],
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation<Project, Error, string>({
    mutationFn: (name: string) => apiClient.post<Project>("/projects", { name }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}
