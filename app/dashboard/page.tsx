"use client";

import Link from "next/link";
import useSWR from "swr";

import { AppShell } from "@/components/AppShell";
import { ContentListCard, type ContentRow } from "@/components/ContentListCard";
import { UsageMeter } from "@/components/UsageMeter";
import { api, type DashboardDTO } from "@/lib/api";
import type { Job, ExportItem } from "@/lib/types";

function formatResetDate(iso: string): string {
  try {
    const d = new Date(iso);
    // Keep it simple and readable (user is Europe/London, but browser locale is ok here)
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "soon";
  }
}

function jobToRow(j: Job): ContentRow {
  const statusMap: Record<Job["status"], ContentRow["status"]> = {
    processing: "Processing",
    needs_review: "Needs Review",
    ready: "Ready",
    failed: "Needs Review", // v1: treat failed as attention-needed; adjust later
  };

  const subtitle = `${j.platform.toUpperCase()} • ${j.preset}`;
  return {
    id: j.id,
    title: j.title,
    subtitle,
    status: statusMap[j.status],
    progressPct: j.progressPct,
  };
}

function exportToRow(e: ExportItem): ContentRow {
  const subtitle = `Exported • ${e.format.toUpperCase()}`;
  return { id: e.id, title: e.title, subtitle };
}

export default function DashboardPage() {
  const { data, error, isLoading, mutate } = useSWR<DashboardDTO>(
    "dashboard",
    () => api.getDashboard(),
    {
      revalidateOnFocus: true,
      dedupingInterval: 2000,
    }
  );

  const inProgressRows: ContentRow[] = data?.jobs?.map(jobToRow) ?? [];
  const exportRows: ContentRow[] = data?.exports?.map(exportToRow) ?? [];

  const usage = data?.usage;

  return (
    <AppShell activeHref="/dashboard">
      {/* Page header */}
      <div className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Welcome back!
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            Create, review, and export in minutes — we’ll keep you within limits.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/create"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Create New Reel
          </Link>

          <Link
            href="/create?resume=1"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
          >
            Continue Draft →
          </Link>

          <button
            type="button"
            onClick={() => mutate()}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
            aria-label="Refresh dashboard"
          >
            Refresh
          </button>
        </div>

        {/* Small inline status */}
        <div className="text-xs text-zinc-500 dark:text-zinc-400">
          {isLoading ? "Loading your workspace…" : error ? "Couldn’t load data." : "Up to date."}
        </div>
      </div>

      {/* Error state */}
      {error ? (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Dashboard data failed to load
          </div>
          <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            Try refreshing. If it keeps happening, check your API routes.
          </div>
          <div className="mt-3">
            <button
              type="button"
              onClick={() => mutate()}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Retry
            </button>
          </div>
        </div>
      ) : null}

      {/* Main grid */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ContentListCard
            title="In Progress"
            rows={
              isLoading
                ? [
                    { id: "s1", title: "Loading…", subtitle: "Please wait" },
                    { id: "s2", title: "Loading…", subtitle: "Please wait" },
                    { id: "s3", title: "Loading…", subtitle: "Please wait" },
                  ]
                : inProgressRows.length
                ? inProgressRows
                : [{ id: "empty", title: "No jobs yet", subtitle: "Click “Create New Reel” to start." }]
            }
            viewAllHref="/review"
          />
        </div>

        <div className="lg:col-span-1">
          <ContentListCard
            title="Recent Exports"
            rows={
              isLoading
                ? [
                    { id: "sx1", title: "Loading…", subtitle: "Please wait" },
                    { id: "sx2", title: "Loading…", subtitle: "Please wait" },
                    { id: "sx3", title: "Loading…", subtitle: "Please wait" },
                  ]
                : exportRows.length
                ? exportRows
                : [{ id: "empty2", title: "No exports yet", subtitle: "Export your first reel from Review." }]
            }
            viewAllHref="/library"
          />
        </div>
      </div>

      {/* Usage */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <UsageMeter
          label="Exports"
          used={usage?.exportsUsed ?? 0}
          limit={usage?.exportsLimit ?? 10}
          footerLeft={usage ? `Resets ${formatResetDate(usage.resetsAt)}` : "Resets soon"}
          footerRight={usage && usage.exportsUsed >= usage.exportsLimit - 2 ? "Low? Upgrade" : "Manage"}
        />

        <UsageMeter
          label="Processing minutes"
          used={usage?.minutesUsed ?? 0}
          limit={usage?.minutesLimit ?? 60}
          footerLeft="Includes hashtag generation"
          footerRight="Manage plan"
        />
      </div>

      {/* Calm upgrade nudge */}
      <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Keep creating without interruptions
            </div>
            <div className="text-sm text-zinc-600 dark:text-zinc-300">
              Pro unlocks more exports, more regenerations, and multiple hashtag sets.
            </div>
          </div>
          <Link
            href="/billing"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
          >
            View plans
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
