"use client";

import { usePathname } from "next/navigation";
import { AppShell } from "~/components/ui-kit/app-shell-kit";
import type { MesocycleView } from "~/views/types";
import { AppNav } from "./app-nav";
import { BlockNavigator } from "./block-navigator";

export function AppFrame({
  children,
  userName,
  userEmail,
  block,
}: {
  children: React.ReactNode;
  userName: string;
  userEmail: string;
  block: MesocycleView | null;
}) {
  const pathname = usePathname() ?? "";
  const isTraining = pathname.startsWith("/app/block");
  const isAnalysis = pathname.startsWith("/app/analysis");
  return (
    <AppShell
      column1={<AppNav userName={userName} userEmail={userEmail} />}
      column2={isTraining && block ? <BlockNavigator block={block} /> : undefined}
      fullBleed={isTraining || isAnalysis}
    >
      {children}
    </AppShell>
  );
}
