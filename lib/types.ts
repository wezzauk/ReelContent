export type JobStatus = "processing" | "needs_review" | "ready" | "failed";

export type Platform = "tiktok" | "reels" | "shorts";

export type Job = {
  id: string;
  title: string;
  platform: Platform;
  preset: string;
  status: JobStatus;
  progressPct?: number;
  updatedAt: string; // ISO
};

export type ExportFormat = "mp4" | "mov";

export type ExportItem = {
  id: string;
  jobId: string;
  title: string;
  format: ExportFormat;
  createdAt: string; // ISO
};

export type Usage = {
  plan: "free" | "starter" | "pro";
  exportsUsed: number;
  exportsLimit: number;
  minutesUsed: number;
  minutesLimit: number;
  resetsAt: string; // ISO
};

export type ApiError =
  | { code: "LIMIT_BLOCKED"; message: string; upgradeUrl?: string }
  | { code: "VALIDATION_ERROR"; message: string; fields?: Record<string, string> }
  | { code: "UNAUTHENTICATED"; message: string }
  | { code: "UNKNOWN"; message: string };
