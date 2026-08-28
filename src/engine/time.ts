import { PER_SET_MIN, SETUP_MIN, WARMUP_MIN } from "./constants";
import type { ExerciseAssignment } from "./types";

/** Estimated minutes for a session. The engine's feasibility currency. */
export function sessionMinutes(exercises: Pick<ExerciseAssignment, "sets">[]): number {
  return exercises.reduce((sum, e) => sum + SETUP_MIN + e.sets * PER_SET_MIN, WARMUP_MIN);
}
