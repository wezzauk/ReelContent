import { NextResponse } from "next/server";
import { getUserUsage } from "@/lib/db/repositories";

export async function GET(req: Request) {
  // userId is available from X-User-Id header (set by middleware)
  const userId = req.headers.get("X-User-Id");

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const usage = await getUserUsage(userId);

  return NextResponse.json(usage);
}
