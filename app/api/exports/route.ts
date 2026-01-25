import { NextResponse } from "next/server";
import type { ExportItem } from "@/lib/types";

function parseLimit(raw: string | null, fallback = 10) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(50, Math.floor(n)));
}

const MOCK_EXPORTS: ExportItem[] = [
  {
    id: "e1",
    jobId: "a4",
    title: "Podcast Highlight: Hook + CTA",
    format: "mp4",
    createdAt: "2026-01-24T09:05:00Z",
  },
  {
    id: "e2",
    jobId: "x2",
    title: "Product Demo Clip",
    format: "mp4",
    createdAt: "2026-01-23T18:22:00Z",
  },
  {
    id: "e3",
    jobId: "x1",
    title: "Cooking Tips Video",
    format: "mov",
    createdAt: "2026-01-23T12:10:00Z",
  },
  {
    id: "e4",
    jobId: "z9",
    title: "Tech Review Short",
    format: "mp4",
    createdAt: "2026-01-22T20:44:00Z",
  },
];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams.get("limit"), 10);

  const exportsList = [...MOCK_EXPORTS].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : -1
  );

  // userId is available from X-User-Id header (set by middleware)
  const userId = req.headers.get("X-User-Id");

  return NextResponse.json({
    exports: exportsList.slice(0, limit),
    userId, // For debugging - remove in production
  });
}
