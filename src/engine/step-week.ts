// src/engine/step-week.ts
import {
  JOINT_PAIN,
  MRV_PROXIMITY_SETS,
  RECOVERY_LOW,
  SCORE_GOOD,
  STEP_DOWN,
  STEP_DOWN_HARD,
  STEP_UP,
} from "./constants";
import type { DecisionFact } from "./facts";
import type {
  AdaptationContext,
  CheckInFeedback,
  MesocyclePlan,
  MuscleAdjustment,
  StepCause,
  WeekAdjustment,
} from "./types";

export function stepWeek(
  plan: MesocyclePlan,
  weekIndex: number,
  feedback: CheckInFeedback | null,
  ctx: AdaptationContext,
): WeekAdjustment {
  const facts: DecisionFact[] = [];
  const appliesTo = weekIndex + 1;
  const upcoming = plan.weeks.find((w) => w.index === appliesTo);
  const current = plan.weeks.find((w) => w.index === weekIndex);
  const upcomingIsDeload = upcoming?.isDeload ?? false;
  const fbByMuscle = new Map(
    (feedback?.muscles ?? []).map((m) => [m.muscle, m]),
  );

  const adjustments: MuscleAdjustment[] = [];
  let anyHigh = false;

  for (const t of ctx.targets) {
    const plannedNext =
      upcoming?.muscleVolume[t.muscle] ?? current?.muscleVolume[t.muscle] ?? 0;
    const currentVol = current?.muscleVolume[t.muscle] ?? 0;
    const fb = fbByMuscle.get(t.muscle);
    const rec = fb?.recovery;
    const perf = fb?.performance;
    const joint = fb?.joint;

    let delta = 0;
    let cause: StepCause = "default_progression";
    let swap = false;

    if (!upcoming || upcomingIsDeload || fb === undefined) {
      cause = "default_progression";
    } else if (joint !== undefined && joint >= JOINT_PAIN) {
      delta = -STEP_DOWN_HARD;
      swap = true;
      cause = "joint_stress";
    } else if (rec !== undefined && rec <= RECOVERY_LOW) {
      delta = plannedNext >= t.mav ? -STEP_DOWN_HARD : -STEP_DOWN;
      cause = "under_recovered";
    } else if (
      rec !== undefined && perf !== undefined &&
      rec >= SCORE_GOOD && perf >= SCORE_GOOD &&
      plannedNext < t.effectiveMrv - 1
    ) {
      delta = STEP_UP;
      cause = "responding_well";
    } else if (
      rec !== undefined && perf !== undefined &&
      rec >= SCORE_GOOD && perf >= SCORE_GOOD &&
      plannedNext > t.effectiveMrv - MRV_PROXIMITY_SETS
    ) {
      cause = "approaching_mrv";
    } else {
      cause = "on_track";
    }

    let adjusted = plannedNext + delta;
    if (adjusted > t.effectiveMrv) adjusted = t.effectiveMrv;
    if (!upcomingIsDeload && adjusted < t.mev) adjusted = t.mev;

    facts.push({ kind: "stepped", muscle: t.muscle, from: plannedNext, to: adjusted, cause });
    if (swap) facts.push({ kind: "swap_suggested", muscle: t.muscle, cause: "joint_stress" });

    adjustments.push({
      muscle: t.muscle,
      plannedSets: plannedNext,
      adjustedSets: adjusted,
      delta: adjusted - plannedNext,
      cause,
      swapCandidate: swap,
    });

    // flaggedNow reflects the COMPLETED week's feedback (spec §6) and must be
    // evaluated unconditionally — even when the upcoming week is the deload
    // or there is no upcoming week — so it never silently drops the safety
    // signal. crossesMav/nearMrv describe the UPCOMING ramp, so they stay
    // gated on a real non-deload upcoming week.
    const flaggedNow =
      (joint !== undefined && joint >= JOINT_PAIN) ||
      (rec !== undefined && rec <= RECOVERY_LOW);
    if (flaggedNow) anyHigh = true;

    if (upcoming && !upcomingIsDeload) {
      const crossesMav = currentVol < t.mav && plannedNext >= t.mav;
      const nearMrv = plannedNext >= t.effectiveMrv - MRV_PROXIMITY_SETS;
      if (crossesMav || nearMrv) anyHigh = true;
    }
  }

  return {
    fromWeekIndex: weekIndex,
    appliesToWeekIndex: appliesTo,
    adjustments,
    checkInValue: anyHigh ? "high" : "low",
    facts,
  };
}
