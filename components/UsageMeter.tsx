function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function UsageMeter({
  label,
  used,
  limit,
  footerLeft,
  footerRight,
}: {
  label: string;
  used: number;
  limit: number;
  footerLeft?: string;
  footerRight?: string;
}) {
  const pct = limit <= 0 ? 0 : clamp((used / limit) * 100, 0, 100);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {label}
          </div>
          <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">
              {used}
            </span>{" "}
            of{" "}
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">
              {limit}
            </span>{" "}
            used
          </div>
        </div>
        <div className="text-xs text-zinc-500 dark:text-zinc-400">
          {Math.round(pct)}%
        </div>
      </div>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className="h-full rounded-full bg-blue-600 transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>

      {(footerLeft || footerRight) && (
        <div className="mt-3 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
          <span>{footerLeft}</span>
          <span>{footerRight}</span>
        </div>
      )}
    </div>
  );
}
