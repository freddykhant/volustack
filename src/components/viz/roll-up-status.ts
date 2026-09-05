import { zoneFor } from "~/components/viz/zone";
import type { TrainingStatusView, WeekView, Zone } from "~/views/types";

/** Roll a week's per-muscle zones into a single training-status readout.
 * Classification only — invents no numbers (Law 1). Rule is top-down,
 * first match wins: deload → Recovering; any muscle at max → Overreaching;
 * optimal a strict majority → Optimal; else Building. */
export function rollUpStatus(week: WeekView): TrainingStatusView {
  const counts: Record<Zone, number> = { rest: 0, building: 0, optimal: 0, max: 0 };
  for (const cell of week.cells) {
    counts[zoneFor(cell.plannedSets, cell)] += 1;
  }
  const total = week.cells.length;
  const inRange = counts.building + counts.optimal + counts.max;

  let label: TrainingStatusView["label"];
  if (week.isDeload) label = "Recovering";
  else if (counts.max > 0) label = "Overreaching";
  else if (counts.optimal * 2 > total) label = "Optimal";
  else label = "Building";

  return { label, counts, inRange, total };
}
