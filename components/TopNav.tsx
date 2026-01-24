import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";


type NavItem = { href: string; label: string };

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Home" },
  { href: "/create", label: "Create" },
  { href: "/review", label: "Review" },
  { href: "/library", label: "Library" },
  { href: "/billing", label: "Billing" },
];

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function TopNav({ activeHref = "/dashboard" }: { activeHref?: string }) {
  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/70">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
            {/* simple icon */}
            <span className="text-sm font-semibold">RC</span>
          </div>
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Reel Content
          </span>
        </div>

        {/* Nav */}
        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => {
            const active = item.href === activeHref;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cx(
                  "rounded-md px-3 py-1.5 text-sm transition",
                  active
                    ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100"
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-zinc-50"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Right controls (placeholders) */}
        <div className="flex items-center gap-2">
          <button
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
            aria-label="Notifications"
            type="button"
          >
            🔔
          </button>

          <button
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
            aria-label="Notifications"
            type="button"
          >
            🔔
          </button>

          <button
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
            aria-label="More options"
            type="button"
          >
            ...
          </button>


          <button
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
            type="button"
          >
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-zinc-200 text-xs font-semibold text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100">
              U
            </span>
            <span className="hidden sm:inline">Account</span>
            <span className="opacity-70">▾</span>
          </button>
        </div>
      </div>
    </header>
  );
}
