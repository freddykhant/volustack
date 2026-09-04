"use client";

import { usePathname } from "next/navigation";
import { AppShell } from "~/components/ui-kit/app-shell-kit";
import { AppNav } from "./app-nav";
import { BlockNavigator } from "./block-navigator";

export function AppFrame({
  children,
  userName,
  userEmail,
}: {
  children: React.ReactNode;
  userName: string;
  userEmail: string;
}) {
  const pathname = usePathname() ?? "";
  const isTraining = pathname.startsWith("/app/block");
  const isAnalysis = pathname.startsWith("/app/analysis");
  return (
    <AppShell
      slug="app"
      workspaceName="Mesodapt"
      column1={<AppNav userName={userName} userEmail={userEmail} />}
      column2={isTraining ? <BlockNavigator /> : undefined}
      fullBleed={isTraining || isAnalysis}
      topNav={<div className="text-nav text-fg-muted">Mesodapt</div>}
    >
      {children}
    </AppShell>
  );
}
