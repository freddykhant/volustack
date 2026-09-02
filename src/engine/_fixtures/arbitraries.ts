// src/engine/_fixtures/arbitraries.ts
import fc from "fast-check";
import { DEFAULT_LANDMARKS } from "~/domain/landmarks";
import { EXERCISE_LIBRARY as _LIB } from "~/domain/exercise-library";
import type { ConstraintSetInput } from "~/schema";
import type { AdaptationContext, AthleteContext, ResolvedSpec } from "../types";
import { ALL_MUSCLES } from "../util";

export function arbAthlete(): fc.Arbitrary<AthleteContext> {
  return fc.record({
    experienceLevel: fc.constantFrom("BEGINNER", "INTERMEDIATE", "ADVANCED"),
    phase: fc.constantFrom("CUT", "MAINTAIN", "BULK"),
    landmarks: fc.constant(DEFAULT_LANDMARKS),
  });
}

export function arbConstraintSet(): fc.Arbitrary<ConstraintSetInput> {
  return fc
    .record({
      daysPerWeek: fc.integer({ min: 3, max: 6 }),
      splitType: fc.constantFrom("UPPER_LOWER", "PUSH_PULL_LEGS", "FULL_BODY"),
      sessionLengthCapMin: fc.integer({ min: 45, max: 120 }),
      blockLengthWeeks: fc.integer({ min: 3, max: 8 }),
      muscleTargets: fc.uniqueArray(
        fc.record({
          muscle: fc.constantFrom(...ALL_MUSCLES),
          weeklySetTarget: fc.integer({ min: 6, max: 18 }),
          priority: fc.integer({ min: 0, max: 5 }),
        }),
        { selector: (t) => t.muscle, maxLength: 6 },
      ),
    })
    .map((r) => ({
      ...r,
      checkInCadence: "WEEKLY" as const,
      excludedExerciseNames: [],
    }));
}

/** Build an AdaptationContext from a resolved spec (adds MAV from default landmarks). */
export function ctxFromSpec(spec: ResolvedSpec): AdaptationContext {
  return {
    targets: spec.targets,
    splitType: spec.splitType,
    daysPerWeek: spec.daysPerWeek,
    sessionLengthCapMin: spec.sessionLengthCapMin,
    blockLengthWeeks: spec.blockLengthWeeks,
    deloadWeekIndex: spec.deloadWeekIndex,
    isBeginner: spec.isBeginner,
    library: _LIB,
  };
}
