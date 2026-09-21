import type { MesocyclePlan } from "~/engine";
import type { SplitType } from "~/schema";
import { weekPlanFromDb, type WeekForPlan } from "./reschedule-adapters";

/**
 * Reconstruct the engine's MesocyclePlan from persisted weeks so `stepWeek` has
 * real input. `stepWeek` reads only `weeks`; block length + deload index are derived
 * from the weeks (correct + self-contained). `facts` is [] (unused by stepWeek).
 */
export function mesocyclePlanFromDb(weeks: WeekForPlan[], splitType: SplitType): MesocyclePlan {
  const ordered = [...weeks].sort((a, b) => a.index - b.index);
  return {
    splitType,
    blockLengthWeeks: ordered.length,
    deloadWeekIndex: ordered.find((w) => w.isDeload)?.index ?? 0,
    weeks: ordered.map(weekPlanFromDb),
    facts: [],
  };
}
