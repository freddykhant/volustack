// src/engine/_fixtures/canonical.ts
import { DEFAULT_LANDMARKS } from "~/domain/landmarks";
import type { ConstraintSetInput } from "~/schema";
import type { AthleteContext } from "../types";

/** The vision's canonical scenario — the frozen regression anchor. */
export const CANONICAL_INPUT: ConstraintSetInput = {
  daysPerWeek: 5,
  splitType: "UPPER_LOWER",
  sessionLengthCapMin: 75,
  blockLengthWeeks: 6,
  deloadWeekIndex: 6,
  checkInCadence: "WEEKLY",
  muscleTargets: [
    { muscle: "CHEST", weeklySetTarget: 16, priority: 1 },
    { muscle: "BACK", weeklySetTarget: 18, priority: 1 },
    { muscle: "QUADS", weeklySetTarget: 12, priority: 0 },
    { muscle: "SIDE_DELTS", weeklySetTarget: 16, priority: 3 },
  ],
  excludedExerciseNames: ["Barbell Back Squat"],
};

export const CANONICAL_ATHLETE: AthleteContext = {
  experienceLevel: "INTERMEDIATE",
  phase: "MAINTAIN",
  landmarks: DEFAULT_LANDMARKS,
};
