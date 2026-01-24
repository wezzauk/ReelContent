import Link from "next/link";

export type ContentRow = {
  id: string;
  title: string;
  subtitle?: string;
  status?: "Needs Review" | "Processing" | "Ready";
  progressPct?: number; // used if Processing
};

function StatusPill({ status, progressPct }: { status?: ContentRow["status"]; progressPct?: number }) {
  if (!status) return null;

  const base =
    "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium";
  const dot = "h-1.5 w-1.5 rounded-full";

  if (status === "Needs Review") {
    return (
      <span className={`${base} bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200`}>
        <span className={`${dot} bg-amber-600`} />
        Needs Review
      </span>
    );
  }

  if (status === "Ready") {
    return (
      <span className={`${base} bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200`}>
        <span className={`${dot} bg-emerald-600`} />
        Ready
      </span>
    );
  }

  // Processing
  return (
    <span className={`${base} bg-zinc-100 text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200`}>
      <span className={`${dot} bg-blue-500`} />
      Processing{typeof progressPct === "number" ? `… ${progressPct}%` : "…"}
    </span>
  );
}

export function ContentListCard({
  title,
  rows,
  viewAllHref,
}: {
  title: string;
  rows: ContentRow[];
  viewAllHref?: string;
}) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {title}
        </h2>
        {viewAllHref ? (
          <Link
            href={viewAllHref}
            className="text-xs font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-50"
          >
            View all →
          </Link>
        ) : null}
      </div>

      <div className="mt-3 divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {rows.map((row) => (
          <Link
            key={row.id}
            href={`/review/${row.id}`}
            className="flex items-center justify-between gap-3 bg-white px-3 py-3 hover:bg-zinc-50 dark:bg-zinc-950 dark:hover:bg-zinc-900"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {row.title}
              </div>
              {row.subtitle ? (
                <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {row.subtitle}
                </div>
              ) : null}
            </div>

            <div className="shrink-0">
              <StatusPill status={row.status} progressPct={row.progressPct} />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
