import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../api-client";
import type { Project, ProjectsResponse } from "../../../types";

async function fetchProjects(): Promise<Project[]> {
  // Nav (and this hook) renders on the public /login page too, before any
  // token exists — fetch manually rather than via apiClient so a 401 there
  // resolves to an empty list instead of triggering apiClient's global
  // redirect-to-login on every anonymous page load.
  const token = localStorage.getItem("jwt");
  const res = await fetch("/api/projects", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
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
