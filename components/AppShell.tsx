import { ReactNode } from "react";
import { TopNav } from "./TopNav";

export function AppShell({
  activeHref,
  children,
}: {
  activeHref: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <TopNav activeHref={activeHref} />
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
