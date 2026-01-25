import { NextResponse } from "next/server";
import { getRecentJobs } from "@/lib/db/repositories";

function parseLimit(raw: string | null, fallback = 10) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(50, Math.floor(n)));
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams.get("limit"), 10);

  // userId is available from X-User-Id header (set by middleware)
  const userId = req.headers.get("X-User-Id");

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobs = await getRecentJobs(userId, limit);

  return NextResponse.json({ jobs });
}
