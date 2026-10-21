"use client";

import { Dumbbell, Home, LineChart, MessageSquare, Library, Settings, LogOut, HeartPulse } from "lucide-react";
import { IconButton, NavItem, Wordmark } from "~/components/ui-kit/app-shell-kit";
import { authClient } from "~/server/better-auth/client";
import { useRouter } from "next/navigation";

export function AppNav({ userName, userEmail }: { userName: string; userEmail: string }) {
  const router = useRouter();
  return (
    <>
      <div className="px-2.5 py-1.5">
        <Wordmark />
      </div>
      <nav className="mt-6 flex flex-col gap-0.5">
        <NavItem appearance="neutral" href="/app" label="Now" icon={Home} matchPatterns={["/app"]} />
        <NavItem appearance="neutral" href="/app/block" label="Block" icon={Dumbbell} matchPatterns={["/app/block", "/app/block/*"]} />
        <NavItem appearance="neutral" href="/app/analysis" label="Analysis" icon={LineChart} matchPatterns={["/app/analysis", "/app/analysis/*"]} />
        <NavItem appearance="neutral" href="/app/readiness" label="Readiness" icon={HeartPulse} matchPatterns={["/app/readiness"]} />
        <NavItem appearance="neutral" href="/app/coach" label="Coach" icon={MessageSquare} matchPatterns={["/app/coach"]} />
        <NavItem appearance="neutral" href="/app/library" label="Library" icon={Library} matchPatterns={["/app/library"]} />
        <NavItem appearance="neutral" href="/app/settings" label="Settings" icon={Settings} matchPatterns={["/app/settings"]} />
      </nav>
      <div className="mt-auto flex items-center gap-2.5 rounded-control px-2.5 py-2">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-aura text-meta font-semibold text-fg-soft">
          {userName.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-nav text-fg">{userName}</div>
          <div className="truncate text-[12px] text-fg-subtle">{userEmail}</div>
        </div>
        <IconButton
          icon={LogOut}
          aria-label="Sign out"
          onClick={() => authClient.signOut({ fetchOptions: { onSuccess: () => router.push("/") } })}
        />
      </div>
    </>
  );
}
