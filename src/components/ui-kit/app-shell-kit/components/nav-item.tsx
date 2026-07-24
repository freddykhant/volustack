"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, type LucideIcon } from "lucide-react";

type Props = {
  href: string;
  label: string;
  icon?: LucideIcon;
  /** Active-state route patterns — exact paths or `/prefix/*`. Defaults to `[href]`. */
  matchPatterns?: string[];
  trailing?: "chevron" | null;
  /** Overrides the router pathname (tests, storybook). Normally omit. */
  currentPath?: string;
  /** "accent" (default): contextual-list row — 16px, accent-on-selection. "neutral": workspace-nav row — 14px, white on 7.5%-white. */
  appearance?: "accent" | "neutral";
};

export function isNavItemActive(currentPath: string, patterns: readonly string[]): boolean {
  for (const p of patterns) {
    if (p.endsWith("/*")) {
      const prefix = p.slice(0, -2);
      if (currentPath === prefix || currentPath.startsWith(prefix + "/")) return true;
    } else if (currentPath === p) {
      return true;
    }
  }
  return false;
}

/** Shared nav row for sidebar columns. Active when the current route matches `matchPatterns`. `appearance="neutral"` = Column-1 workspace nav; default `"accent"` = Column-2 contextual list. `trailing="chevron"` adds a right disclosure. */
export function NavItem({ href, label, icon: Icon, matchPatterns, trailing, currentPath, appearance = "accent" }: Props) {
  const pathname = usePathname();
  const path = currentPath ?? pathname ?? "";
  const active = isNavItemActive(path, matchPatterns ?? [href]);
  const look =
    appearance === "neutral"
      ? "rounded-control text-nav " + (active ? "bg-surface-raised text-fg" : "text-fg-muted hover:text-fg")
      : "rounded-pill text-list " + (active ? "bg-selection text-accent" : "text-fg-muted hover:text-fg");
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={"flex items-center gap-2 px-2.5 py-1.5 transition-colors " + look}
    >
      {Icon ? <Icon className="size-4" /> : null}
      <span className="flex-1">{label}</span>
      {trailing === "chevron" ? <ChevronRight className="size-4 text-fg-subtle" /> : null}
    </Link>
  );
}
