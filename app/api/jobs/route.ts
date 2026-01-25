import { NextResponse } from "next/server";
import type { Job, JobStatus } from "@/lib/types";

function parseStatuses(raw: string | null): JobStatus[] | null {
  if (!raw) return null;
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const allowed: JobStatus[] = ["processing", "needs_review", "ready", "failed"];
  const statuses = parts.filter((p): p is JobStatus => allowed.includes(p as JobStatus));
  return statuses.length ? statuses : null;
}

function parseLimit(raw: string | null, fallback = 10) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(50, Math.floor(n)));
}

const MOCK_JOBS: Job[] = [
  {
    id: "a1",
    title: "Editing Tips Tutorial",
    platform: "reels",
    preset: "Educational",
    status: "needs_review",
    updatedAt: "2026-01-24T09:30:00Z",
  },
  {
    id: "a2",
    title: "Fitness Clip (Cutdown)",
    platform: "tiktok",
    preset: "High-energy tutorial",
    status: "processing",
    progressPct: 52,
    updatedAt: "2026-01-24T09:36:00Z",
  },
  {
    id: "a3",
    title: "Travel Vlog Snippet",
    platform: "reels",
    preset: "Storytime",
    status: "processing",
    progressPct: 18,
    updatedAt: "2026-01-24T09:40:00Z",
  },
  {
    id: "a4",
    title: "Podcast Highlight: Hook + CTA",
    platform: "shorts",
    preset: "Commentary",
    status: "ready",
    updatedAt: "2026-01-24T08:55:00Z",
  },
  {
    id: "a5",
    title: "Skincare 3 Mistakes",
    platform: "tiktok",
    preset: "Beginner-friendly explainer",
    status: "failed",
    updatedAt: "2026-01-24T08:10:00Z",
  },
];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams.get("limit"), 10);
  const statuses = parseStatuses(url.searchParams.get("status"));

  let jobs = [...MOCK_JOBS];

  if (statuses) {
    jobs = jobs.filter((j) => statuses.includes(j.status));
  }

  // Sort by updatedAt desc
  jobs.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

  // Trim
  jobs = jobs.slice(0, limit);

  // userId is available from X-User-Id header (set by middleware)
  const userId = req.headers.get("X-User-Id");

  return NextResponse.json({
    jobs,
    userId, // For debugging - remove in production
  });
}
