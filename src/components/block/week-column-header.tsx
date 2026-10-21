import Link from "next/link";
import type { WeekView } from "~/views/types";

export function WeekColumnHeader({ week }: { week: WeekView }) {
  const label = week.isDeload ? "DL" : `Wk ${week.index}`;
  return (
    <Link
      href={`/app/block/week/${week.index}`}
      aria-current={week.isCurrent ? "true" : undefined}
      className="flex h-9 items-center justify-center"
    >
      <span
        className={
          "inline-flex h-7 items-center rounded-pill px-2.5 text-meta font-medium tabular-nums transition-colors " +
          (week.isCurrent
            ? "bg-selection text-accent"
            : week.isDeload
              ? "text-fg-subtle hover:bg-hover hover:text-fg"
              : "text-fg-muted hover:bg-hover hover:text-fg")
        }
      >
        {label}
      </span>
    </Link>
  );
}
