"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MesocycleView } from "~/views/types";

export function BlockNavigator({ block }: { block: MesocycleView }) {
  const pathname = usePathname() ?? "";
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/app/block" className="text-list font-semibold text-fg hover:text-accent">
          {block.name}
        </Link>
        <div className="text-[12px] text-fg-subtle">{block.status}</div>
      </div>
      <nav className="flex flex-col gap-0.5">
        {block.weeks.map((w) => {
          const href = `/app/block/week/${w.index}`;
          const active = pathname === href;
          const marker = w.index < block.currentWeekIndex ? "✓" : w.isCurrent ? "◀" : "";
          const label = w.isDeload ? "Deload" : `Wk ${w.index}`;
          return (
            <Link
              key={w.index}
              href={href}
              className={
                "flex items-center justify-between rounded-pill px-2.5 py-1.5 text-list transition-colors " +
                (active ? "bg-selection text-accent" : "text-fg-muted hover:text-fg")
              }
            >
              <span>{label}</span>
              <span className={w.isCurrent ? "text-accent" : "text-fg-subtle"}>{marker}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
