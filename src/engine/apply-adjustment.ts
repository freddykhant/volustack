// src/engine/apply-adjustment.ts
import type { ExerciseDef } from "~/domain/exercise-library";
import { distributeVolume } from "./distribute";
import { prescribe } from "./prescribe";
import { buildSessionSlots } from "./split";
import type { ResolvedSpec, SessionPlan, WeekAdjustment, WeekPlan } from "./types";

/**
 * Turn a `stepWeek` WeekAdjustment into a concrete WeekPlan for the upcoming week.
 * `adjustedSets` per muscle become the week's weekly targets; distributeVolume lays
 * them into the split's sessions; the distributed sessions are remapped onto the
 * stored week's real TrainingSession ids (by canonical order) so applyWeekPlanToDb
 * can match rows. Deterministic (Law 2). isDeload is always false here — the caller
 * short-circuits deload/last-week to informational proposals that never apply.
 */
export function weekPlanFromAdjustment(
  spec: ResolvedSpec,
  library: ExerciseDef[],
  adj: WeekAdjustment,
  upcoming: WeekPlan,
): WeekPlan {
  const adjMap = new Map(adj.adjustments.map((a) => [a.muscle, a.adjustedSets]));
  const overridden: ResolvedSpec = {
    ...spec,
    targets: spec.targets.map((t) => ({
      ...t,
      weeklySetTarget: adjMap.get(t.muscle) ?? t.weeklySetTarget,
    })),
  };

  const slots = buildSessionSlots(spec.splitType, spec.daysPerWeek);
  const template = distributeVolume(overridden, library, slots);

  if (template.sessions.length !== upcoming.sessions.length) {
    throw new Error(
      "weekPlanFromAdjustment: session count mismatch between distributed and stored week.",
    );
  }

  const sessions: SessionPlan[] = template.sessions.map((s, i) => ({
    slotId: upcoming.sessions[i]!.slotId, // synthetic → real TrainingSession.id
    label: upcoming.sessions[i]!.label,
    prescriptions: s.exercises.map((a) => prescribe(a, library, false)),
    estimatedMinutes: s.estimatedMinutes,
  }));

  return {
    index: adj.appliesToWeekIndex,
    isDeload: false,
    sessions,
    muscleVolume: template.achievedVolume,
  };
}
