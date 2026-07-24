"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { isNavItemActive } from "./nav-item";

export type Tab = {
  href: string;
  label: string;
  icon?: LucideIcon;
  matchPatterns?: string[];
  disabled?: boolean;
  /** Shown as a tooltip on the greyed-out tab. */
  disabledReason?: string;
};

/** Tab-underline pattern (hub bar and detail pages): 14px/500 tabs, active tab white with a 2px accent underline at the strip's bottom edge; disabled tabs stay visible (greyed) with a tooltip. Give the surrounding container `border-b border-border-subtle`. */
export function TabStrip({ tabs, currentPath }: { tabs: readonly Tab[]; currentPath?: string }) {
  const pathname = usePathname();
  const path = currentPath ?? pathname ?? "";
  return (
    <nav className="flex items-center gap-5">
      {tabs.map((t) => {
        const active = isNavItemActive(path, t.matchPatterns ?? [t.href]);
        const cls =
          "relative flex items-center gap-2 py-3 text-nav font-medium transition-colors " +
          (t.disabled
            ? "cursor-not-allowed text-fg-subtle/60"
            : active
              ? "text-fg"
              : "text-fg-muted hover:text-fg");
        const inner = (
          <>
            {t.icon ? <t.icon className="size-4" /> : null}
            <span>{t.label}</span>
            {active && !t.disabled ? (
              <span className="absolute inset-x-0 -bottom-px h-0.5 bg-accent" />
            ) : null}
          </>
        );
        return t.disabled ? (
          <span key={t.href} title={t.disabledReason ?? "Coming soon"} className={cls}>
            {inner}
          </span>
        ) : (
          <Link key={t.href} href={t.href} className={cls}>
            {inner}
          </Link>
        );
      })}
    </nav>
  );
}
