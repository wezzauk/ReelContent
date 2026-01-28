"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { ContentListCard, type ContentRow } from "@/components/ContentListCard";
import useSWR from "swr";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error?.message || "Failed to fetch");
  }
  return res.json();
};

function getStatusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "Queued";
    case "processing":
      return "Processing";
    case "completed":
      return "Ready";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

export default function ReviewListPage() {
  const router = useRouter();

  // Fetch draft list
  const { data: draftsData, error: draftsError, isLoading: draftsLoading } = useSWR(
    "/api/jobs?status=processing,needs_review,completed",
    fetcher
  );

  const drafts = draftsData?.jobs || [];
  const rows: ContentRow[] = drafts.map((j: any) => ({
    id: j.id,
    title: j.title || "Untitled",
    subtitle: `${j.platform.toUpperCase()} • ${getStatusLabel(j.status)}`,
    status: j.status === "processing" ? "Processing" : j.status === "completed" ? "Ready" : j.status === "failed" ? "Needs Review" : "Processing",
    onClick: () => router.push(`/review/${j.id}`),
  }));

  return (
    <AppShell activeHref="/review">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Review & Edit
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            Review your generated content and make edits.
          </p>
        </div>

        <ContentListCard
          title="Your Drafts"
          rows={
            draftsLoading
              ? [
                  { id: "s1", title: "Loading…", subtitle: "Please wait" },
                  { id: "s2", title: "Loading…", subtitle: "Please wait" },
                ]
              : drafts.length
              ? rows
              : [{ id: "empty", title: "No drafts yet", subtitle: "Create your first reel from the dashboard." }]
          }
          viewAllHref="/dashboard"
        />
      </div>
    </AppShell>
  );
}
