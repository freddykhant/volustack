import Link from "next/link";
import type { WeekView } from "~/views/types";

export function WeekColumnHeader({ week }: { week: WeekView }) {
  const label = week.isDeload ? "DL" : `Wk ${week.index}`;
  return (
    <Link
      href={`/app/block/week/${week.index}`}
      className={
        "block px-2 py-1.5 text-center text-nav transition-colors hover:text-fg " +
        (week.isCurrent ? "font-semibold text-accent" : week.isDeload ? "text-fg-subtle" : "text-fg-muted")
      }
    >
      {label}
    </Link>
  );
}
