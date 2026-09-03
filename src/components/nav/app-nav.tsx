"use client";

import { Dumbbell, LineChart, MessageSquare, Library, Settings, LogOut } from "lucide-react";
import { NavItem } from "~/components/ui-kit/app-shell-kit";
import { authClient } from "~/server/better-auth/client";
import { useRouter } from "next/navigation";

export function AppNav({ userName, userEmail }: { userName: string; userEmail: string }) {
  const router = useRouter();
  return (
    <>
      <div className="flex items-center gap-2 px-2.5 py-1.5 text-card-title text-fg">
        <Dumbbell className="size-5 text-accent" />
        Mesodapt
      </div>
      <nav className="mt-6 flex flex-col gap-0.5">
        <NavItem appearance="neutral" href="/app/block" label="Block" icon={Dumbbell} matchPatterns={["/app/block", "/app/block/*"]} />
        <NavItem appearance="neutral" href="/app/analysis" label="Analysis" icon={LineChart} matchPatterns={["/app/analysis", "/app/analysis/*"]} />
        <NavItem appearance="neutral" href="/app/coach" label="Coach" icon={MessageSquare} matchPatterns={["/app/coach"]} />
        <NavItem appearance="neutral" href="/app/library" label="Library" icon={Library} matchPatterns={["/app/library"]} />
        <NavItem appearance="neutral" href="/app/settings" label="Settings" icon={Settings} matchPatterns={["/app/settings"]} />
      </nav>
      <div className="mt-auto flex items-center gap-3 border-t border-border-subtle pt-4">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-nav text-fg-muted">
          {userName.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-nav text-fg">{userName}</div>
          <div className="truncate text-[12px] text-fg-subtle">{userEmail}</div>
        </div>
        <button
          type="button"
          aria-label="Sign out"
          onClick={() => authClient.signOut({ fetchOptions: { onSuccess: () => router.push("/") } })}
          className="rounded-control p-1.5 text-fg-subtle transition-colors hover:text-fg"
        >
          <LogOut className="size-4" />
        </button>
      </div>
    </>
  );
}
