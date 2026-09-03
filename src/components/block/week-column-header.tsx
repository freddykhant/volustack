import Link from "next/link";
import type { MesocycleView, WeekView } from "~/views/types";

export function WeekColumnHeader({ block, week }: { block: MesocycleView; week: WeekView }) {
  const label = week.isDeload ? "DL" : `Wk ${week.index}`;
  return (
    <Link
      href={`/app/block/${block.id}/week/${week.index}`}
      className={
        "block px-2 py-1.5 text-center text-nav transition-colors hover:text-fg " +
        (week.isCurrent ? "font-semibold text-accent" : week.isDeload ? "text-fg-subtle" : "text-fg-muted")
      }
    >
      {label}
    </Link>
  );
}
