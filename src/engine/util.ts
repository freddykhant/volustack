// src/engine/util.ts
import type { ExerciseDef } from "~/domain/exercise-library";
import type { MuscleGroup } from "~/schema";
import type { ExerciseAssignment, MuscleVolumeMap } from "./types";

/** All muscle groups, in enum order. A test guarantees parity with the Zod enum. */
export const ALL_MUSCLES: MuscleGroup[] = [
  "CHEST", "BACK", "TRAPS", "FRONT_DELTS", "SIDE_DELTS", "REAR_DELTS",
  "BICEPS", "TRICEPS", "FOREARMS", "ABS", "QUADS", "HAMSTRINGS", "GLUTES", "CALVES",
];

export function emptyVolumeMap(): MuscleVolumeMap {
  const m = {} as MuscleVolumeMap;
  for (const muscle of ALL_MUSCLES) m[muscle] = 0;
  return m;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function roundVolumeMap(m: MuscleVolumeMap): MuscleVolumeMap {
  const out = {} as MuscleVolumeMap;
  for (const muscle of ALL_MUSCLES) out[muscle] = round1(m[muscle]);
  return out;
}

/** Fractional achieved weekly volume from a flat list of assignments. */
export function computeVolume(
  assignments: ExerciseAssignment[],
  library: ExerciseDef[],
): MuscleVolumeMap {
  const byName = new Map(library.map((e) => [e.name, e]));
  const vol = emptyVolumeMap();
  for (const a of assignments) {
    const ex = byName.get(a.exerciseName);
    if (!ex) continue;
    for (const mm of ex.muscles) vol[mm.muscle] += a.sets * mm.fraction;
  }
  return vol;
}
