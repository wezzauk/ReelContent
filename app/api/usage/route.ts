import { NextResponse } from "next/server";
import type { Usage } from "@/lib/types";

export async function GET(req: Request) {
  const usage: Usage = {
    plan: "starter",
    exportsUsed: 8,
    exportsLimit: 10,
    minutesUsed: 32,
    minutesLimit: 60,
    resetsAt: "2026-02-01T00:00:00Z",
  };

  // userId is available from X-User-Id header (set by middleware)
  const userId = req.headers.get("X-User-Id");

  return NextResponse.json({
    ...usage,
    userId, // For debugging - remove in production
  });
}
