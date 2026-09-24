import type { CheckInFeedback, MuscleVolumeMap, WeekOutcome } from "~/engine";
import { MUSCLE_GROUPS, type MuscleGroup } from "~/schema";

export interface WeekForOutcome {
  index: number;
  muscleVolumes: { muscle: MuscleGroup; plannedSets: number }[];
  checkIns: {
    scope: string;
    muscleFeedback: {
      muscle: MuscleGroup;
      recovery: number | null;
      performance: number | null;
      jointStress: number | null;
    }[];
  }[];
}

/** Reconstruct the engine's WeekOutcome[] history (per-week volume + check-in
 * feedback) so `evaluateDeload` has real input. feedback is null when a week has
 * no WEEK check-in. Pure. */
export function weekOutcomesFromBlock(weeks: WeekForOutcome[]): WeekOutcome[] {
  return [...weeks]
    .sort((a, b) => a.index - b.index)
    .map((w) => {
      const muscleVolume = Object.fromEntries(MUSCLE_GROUPS.map((m) => [m, 0])) as MuscleVolumeMap;
      for (const v of w.muscleVolumes) muscleVolume[v.muscle] = v.plannedSets;

      const checkIn = w.checkIns.find((c) => c.scope === "WEEK");
      const feedback: CheckInFeedback | null = checkIn
        ? {
            weekIndex: w.index,
            muscles: checkIn.muscleFeedback.map((m) => ({
              muscle: m.muscle,
              recovery: m.recovery ?? undefined,
              performance: m.performance ?? undefined,
              joint: m.jointStress ?? undefined,
            })),
          }
        : null;

      return { weekIndex: w.index, muscleVolume, feedback };
    });
}
