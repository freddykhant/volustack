import Link from "next/link";
import { zoneFor } from "~/components/viz/zone";
import { ZONE_FILL, ZONE_SOFT } from "~/components/viz/zone-legend";
import type { MuscleWeekCell, WeekView } from "~/views/types";

export function GridCell({
  week,
  cell,
}: {
  week: WeekView;
  cell: MuscleWeekCell;
}) {
  const zone = zoneFor(cell.plannedSets, cell);
  const tooltip = `${cell.plannedSets} sets — ${zone} · MEV ${cell.mev} / MAV ${cell.mav} / MRV ${cell.mrv}`;
  return (
    <Link
      href={`/app/block/week/${week.index}`}
      title={tooltip}
      className={
        "group relative flex h-10 items-center justify-center rounded-control text-nav tabular-nums transition-[box-shadow,transform] duration-200 ease-soft hover:-translate-y-px hover:shadow-control " +
        ZONE_SOFT[zone] +
        (week.isCurrent ? " font-semibold text-fg ring-1 ring-accent/30 ring-inset" : " text-fg-soft") +
        (week.isDeload ? " opacity-60" : "")
      }
    >
      {/* full-strength zone tick: the soft wash alone is too faint to tell zones apart */}
      <span aria-hidden className={"absolute top-1/2 left-2 h-3.5 w-[3px] -translate-y-1/2 rounded-pill " + ZONE_FILL[zone]} />
      {cell.plannedSets}
    </Link>
  );
}
