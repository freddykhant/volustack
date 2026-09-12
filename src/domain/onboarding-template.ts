import type { ConstraintSetInput, ExperienceLevel, OnboardingInput } from "~/schema";

/**
 * The one-time onboarding shortcut: proficiency picks a cookie-cutter block
 * shape so a new athlete gets a real template instead of a blank slate. It is
 * NOT an ongoing engine dimension — after generation, nothing keys off it.
 */
export const PROFICIENCY_TEMPLATE: Record<
  ExperienceLevel,
  { blockLengthWeeks: number; deloadWeekIndex: number }
> = {
  BEGINNER: { blockLengthWeeks: 4, deloadWeekIndex: 4 },
  INTERMEDIATE: { blockLengthWeeks: 6, deloadWeekIndex: 6 },
  ADVANCED: { blockLengthWeeks: 8, deloadWeekIndex: 8 },
};

/**
 * Pure map: wizard input → the engine's ConstraintSetInput contract. Logistics
 * and split pass through; priority muscles become priority-3 targets (weekly
 * target left unset so the engine fills MEV-based defaults); block shape comes
 * from the proficiency template.
 */
export function buildConstraintSetInput(input: OnboardingInput): ConstraintSetInput {
  const template = PROFICIENCY_TEMPLATE[input.proficiency];
  return {
    daysPerWeek: input.daysPerWeek,
    splitType: input.splitType,
    sessionLengthCapMin: input.sessionLengthCapMin,
    blockLengthWeeks: template.blockLengthWeeks,
    deloadWeekIndex: template.deloadWeekIndex,
    checkInCadence: "WEEKLY",
    // The engine ignores per-muscle priority for BEGINNER athletes (flat
    // MEV-MAV volume for every muscle), so persisting priority targets here
    // would be a no-op that misleadingly shows as "prioritized" in the UI.
    muscleTargets:
      input.proficiency === "BEGINNER"
        ? []
        : input.priorityMuscles.map((muscle) => ({ muscle, priority: 3 })),
    excludedExerciseNames: [],
  };
}
