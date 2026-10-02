import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../api-client";
import { useAuth } from "../auth-context";
import type { Project, ProjectsResponse } from "../../../types";

async function fetchProjects(): Promise<Project[]> {
  const data = await apiClient.get<ProjectsResponse>("/projects");
  return data.projects;
}

/**
 * Projects for the signed-in user. Disabled while signed out — Nav renders on
 * the public /login page too, and must not fire an unauthenticated request there.
 */
export function useProjects() {
  const { user } = useAuth();
  return useQuery<Project[]>({
    queryKey: ["projects", user?.userId],
    queryFn: fetchProjects,
    enabled: Boolean(user),
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
