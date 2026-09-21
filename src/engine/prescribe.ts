// src/engine/prescribe.ts
import type { ExerciseDef } from "~/domain/exercise-library";
import {
  COMPOUND_REPS,
  COMPOUND_RIR,
  DELOAD_RIR,
  ISOLATION_REPS,
  ISOLATION_RIR,
} from "./constants";
import type { ExerciseAssignment, PrescriptionPlan } from "./types";

/** Assign rep range + RIR to an exercise assignment. Extracted from the generator
 * so the progression path prescribes identically (single source of truth). */
export function prescribe(
  a: ExerciseAssignment,
  library: ExerciseDef[],
  isDeload: boolean,
): PrescriptionPlan {
  const iso = library.find((e) => e.name === a.exerciseName)?.movementPattern === "ISOLATION";
  const reps = iso ? ISOLATION_REPS : COMPOUND_REPS;
  const rir = isDeload ? DELOAD_RIR : iso ? ISOLATION_RIR : COMPOUND_RIR;
  return {
    exerciseName: a.exerciseName,
    sets: a.sets,
    repRangeLow: reps.low,
    repRangeHigh: reps.high,
    targetRir: rir,
  };
}
