import type { ExerciseDef } from "~/domain/exercise-library";
import { DELOAD_FRACTION } from "./constants";
import { distributeVolume } from "./distribute";
import { prescribe } from "./prescribe";
import { buildSessionSlots } from "./split";
import type { ResolvedSpec, SessionPlan, WeekPlan } from "./types";
import { round1 } from "./util";

/**
 * Build a deload WeekPlan for the upcoming week: every muscle's target scaled to
 * DELOAD_FRACTION of its peak, distributed into the split, prescribed at deload RIR,
 * remapped onto the stored week's real TrainingSession ids. Mirrors
 * weekPlanFromAdjustment; deterministic (Law 2).
 */
export function deloadWeekPlan(
  spec: ResolvedSpec,
  library: ExerciseDef[],
  upcoming: WeekPlan,
): WeekPlan {
  const overridden: ResolvedSpec = {
    ...spec,
    targets: spec.targets.map((t) => ({
      ...t,
      weeklySetTarget: round1(t.weeklySetTarget * DELOAD_FRACTION),
    })),
  };

  const slots = buildSessionSlots(spec.splitType, spec.daysPerWeek);
  const template = distributeVolume(overridden, library, slots);

  if (template.sessions.length !== upcoming.sessions.length) {
    throw new Error(
      "deloadWeekPlan: session count mismatch between distributed and stored week.",
    );
  }

  const sessions: SessionPlan[] = template.sessions.map((s, i) => ({
    slotId: upcoming.sessions[i]!.slotId,
    label: upcoming.sessions[i]!.label,
    prescriptions: s.exercises.map((a) => prescribe(a, library, true)), // isDeload → DELOAD_RIR
    estimatedMinutes: s.estimatedMinutes,
  }));

  return {
    index: upcoming.index,
    isDeload: true,
    sessions,
    muscleVolume: template.achievedVolume,
  };
}
