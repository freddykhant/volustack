import Link from "next/link";
import { zoneFor } from "~/components/viz/zone";
import type { MesocycleView, MuscleWeekCell, WeekView } from "~/views/types";

const SOFT: Record<string, string> = {
  rest: "bg-zone-rest-soft",
  building: "bg-zone-building-soft",
  optimal: "bg-zone-optimal-soft",
  max: "bg-zone-max-soft",
};

export function GridCell({
  block,
  week,
  cell,
}: {
  block: MesocycleView;
  week: WeekView;
  cell: MuscleWeekCell;
}) {
  const zone = zoneFor(cell.plannedSets, cell);
  const tooltip = `${cell.plannedSets} sets — ${zone} · MEV ${cell.mev} / MAV ${cell.mav} / MRV ${cell.mrv}`;
  return (
    <Link
      href={`/app/block/${block.id}/week/${week.index}`}
      title={tooltip}
      className={
        "flex h-10 items-center justify-center text-nav text-fg transition-opacity hover:opacity-80 " +
        SOFT[zone] +
        (week.isCurrent ? " ring-1 ring-inset ring-accent/40" : "") +
        (week.isDeload ? " opacity-60" : "")
      }
    >
      {cell.plannedSets}
    </Link>
  );
}
