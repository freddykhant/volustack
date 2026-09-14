import type { Prisma } from "../../../generated/prisma";
import { EXERCISE_LIBRARY } from "~/domain/exercise-library";
import {
  resolveConstraints,
  type AdaptationContext,
  type AthleteContext,
  type MuscleVolumeMap,
  type WeekPlan,
} from "~/engine";
import { MUSCLE_GROUPS, type ConstraintSetInput, type MuscleGroup } from "~/schema";

/** The week shape `weekPlanFromDb` needs: sessions (+prescriptions+exercise) and muscle volumes. */
export const WEEK_FOR_PLAN_INCLUDE = {
  muscleVolumes: true,
  sessions: { include: { prescriptions: { include: { exercise: true } } } },
} satisfies Prisma.WeekInclude;

export type WeekForPlan = Prisma.WeekGetPayload<{ include: typeof WEEK_FOR_PLAN_INCLUDE }>;

/**
 * Inverse of the persist/view mappers: reconstruct the engine's WeekPlan from a
 * persisted week so `redistributeWeek` has real input. slotId = TrainingSession.id
 * (so candidates map straight back to DB rows). muscleVolume is a full map (0 for
 * muscles with no row). Nullable target fields coalesce to 0, matching the view mapper.
 */
export function weekPlanFromDb(week: WeekForPlan): WeekPlan {
  const muscleVolume = Object.fromEntries(MUSCLE_GROUPS.map((m) => [m, 0])) as MuscleVolumeMap;
  for (const v of week.muscleVolumes) muscleVolume[v.muscle] = v.plannedSets;

  const sessions = [...week.sessions]
    .sort((a, b) => a.order - b.order)
    .map((s) => ({
      slotId: s.id,
      label: s.splitSlot,
      estimatedMinutes: s.targetDurationMin ?? 0,
      prescriptions: [...s.prescriptions]
        .sort((a, b) => a.order - b.order)
        .map((p) => ({
          exerciseName: p.exercise.name,
          sets: p.sets,
          repRangeLow: p.targetRepLow ?? 0,
          repRangeHigh: p.targetRepHigh ?? 0,
          targetRir: p.targetRir ?? 0,
        })),
    }));

  return { index: week.index, isDeload: week.isDeload, sessions, muscleVolume };
}

export const CS_WITH_TARGETS_INCLUDE = { muscleTargets: true } satisfies Prisma.ConstraintSetInclude;
export type ConstraintSetWithTargets = Prisma.ConstraintSetGetPayload<{
  include: typeof CS_WITH_TARGETS_INCLUDE;
}>;

/** Stored constraint-set row → the engine's ConstraintSetInput contract. Exclusions
 * are not wired by onboarding (② always sets []), and redistribute uses the full
 * library, so excludedExerciseNames is []. */
export function constraintSetInputFromRow(cs: ConstraintSetWithTargets): ConstraintSetInput {
  return {
    daysPerWeek: cs.daysPerWeek,
    splitType: cs.splitType,
    sessionLengthCapMin: cs.sessionLengthCapMin,
    blockLengthWeeks: cs.blockLengthWeeks,
    deloadWeekIndex: cs.deloadWeekIndex ?? undefined,
    checkInCadence: cs.checkInCadence,
    muscleTargets: cs.muscleTargets.map((t) => ({
      muscle: t.muscle,
      weeklySetTarget: t.weeklySetTarget ?? undefined,
      priority: t.priority,
    })),
    excludedExerciseNames: [],
  };
}

/** Assemble the AdaptationContext `redistributeWeek` needs by re-resolving the
 * stored constraint set (for resolved targets + isBeginner). */
export function adaptationContextFrom(
  cs: ConstraintSetWithTargets,
  athlete: AthleteContext,
): AdaptationContext {
  const spec = resolveConstraints(constraintSetInputFromRow(cs), athlete);
  if (spec.kind !== "resolved") {
    throw new Error("adaptationContextFrom: stored constraint set re-resolved as infeasible.");
  }
  return {
    targets: spec.targets,
    splitType: spec.splitType,
    daysPerWeek: spec.daysPerWeek,
    sessionLengthCapMin: spec.sessionLengthCapMin,
    blockLengthWeeks: spec.blockLengthWeeks,
    deloadWeekIndex: spec.deloadWeekIndex,
    isBeginner: spec.isBeginner,
    library: EXERCISE_LIBRARY,
  };
}
