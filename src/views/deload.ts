import type { WeekPlan } from "~/engine";
import type { MuscleGroup } from "~/schema";
import type { DeloadMuscleRow, DeloadProposalView } from "./types";

/** Map the upcoming week vs its deloaded rebuild into the accept-gate view. Rows
 * cover muscles the upcoming week trains (planned > 0); deltas come from the two
 * engine plans — no numbers invented (Law 1). */
export function toDeloadProposalView(
  upcoming: WeekPlan,
  deloaded: WeekPlan,
  fatiguedMuscles: MuscleGroup[],
  fromWeekIndex: number,
): DeloadProposalView {
  const rows: DeloadMuscleRow[] = (Object.keys(upcoming.muscleVolume) as MuscleGroup[])
    .filter((m) => upcoming.muscleVolume[m] > 0)
    .map((m) => {
      const plannedSets = upcoming.muscleVolume[m];
      const deloadedSets = deloaded.muscleVolume[m] ?? 0;
      return { muscle: m, plannedSets, deloadedSets, delta: deloadedSets - plannedSets };
    })
    .sort((a, b) => a.delta - b.delta); // biggest cut first

  return {
    kind: "DELOAD",
    fromWeekIndex,
    appliesToWeekIndex: upcoming.index,
    fatiguedMuscles,
    rows,
  };
}
