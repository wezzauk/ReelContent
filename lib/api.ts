import type { ApiError, ExportItem, Job, Usage } from "./types";

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  const json = await res.json();
  if (!res.ok) throw (json as ApiError);
  return json as T;
}

export type DashboardDTO = {
  jobs: Job[];
  exports: ExportItem[];
  usage: Usage;
};

export const api = {
  getDashboard: async (): Promise<DashboardDTO> => {
    const [jobs, exports, usage] = await Promise.all([
      apiGet<Job[]>(`/api/jobs?limit=3&status=processing,needs_review`),
      apiGet<ExportItem[]>(`/api/exports?limit=3`),
      apiGet<Usage>(`/api/usage`),
    ]);
    return { jobs, exports, usage };
  },
};
