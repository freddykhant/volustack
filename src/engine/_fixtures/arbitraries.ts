// src/engine/_fixtures/arbitraries.ts
import fc from "fast-check";
import { DEFAULT_LANDMARKS } from "~/domain/landmarks";
import type { ConstraintSetInput } from "~/schema";
import type { AthleteContext } from "../types";
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
