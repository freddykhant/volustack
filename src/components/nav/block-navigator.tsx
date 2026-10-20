"use client";

import { forwardRef } from "react";
import Link from "next/link";
import { Check, Circle, CircleDot, type LucideIcon, type LucideProps } from "lucide-react";
import { NavItem } from "~/components/ui-kit/app-shell-kit";
import type { MesocycleView } from "~/views/types";

/** The current week keeps its accent dot even when it isn't the open row. */
const CurrentWeekIcon: LucideIcon = forwardRef<SVGSVGElement, LucideProps>(function CurrentWeekIcon({ className, ...props }, ref) {
  return <CircleDot ref={ref} {...props} className={(className ?? "") + " text-accent"} />;
});

/** Upcoming weeks: a faint ring, so the column reads done → now → ahead. */
const UpcomingWeekIcon: LucideIcon = forwardRef<SVGSVGElement, LucideProps>(function UpcomingWeekIcon(props, ref) {
  return <Circle ref={ref} {...props} strokeOpacity={0.45} />;
});

export function BlockNavigator({ block }: { block: MesocycleView }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="px-2.5">
        <div className="text-eyebrow font-medium text-fg-subtle">{block.status}</div>
        <Link href="/app/block" className="mt-1 block text-list font-semibold text-fg transition-colors hover:text-accent">
          {block.name}
        </Link>
      </div>
      <nav aria-label="Weeks" className="flex flex-col gap-0.5">
        {block.weeks.map((w) => {
          const icon = w.index < block.currentWeekIndex ? Check : w.isCurrent ? CurrentWeekIcon : UpcomingWeekIcon;
          return (
            <NavItem
              key={w.index}
              href={`/app/block/week/${w.index}`}
              label={w.isDeload ? "Deload" : `Wk ${w.index}`}
              icon={icon}
            />
          );
        })}
      </nav>
    </div>
  );
}
