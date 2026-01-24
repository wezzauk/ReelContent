import { NextResponse } from "next/server";
import type { Usage } from "@/lib/types";

export async function GET() {
  const usage: Usage = {
    plan: "starter",
    exportsUsed: 8,
    exportsLimit: 10,
    minutesUsed: 32,
    minutesLimit: 60,
    resetsAt: "2026-02-01T00:00:00Z",
  };

  return NextResponse.json(usage);
}
