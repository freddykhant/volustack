import type { ExerciseDef } from "~/domain/exercise-library";
import type { ResolvedMuscleTarget } from "~/engine";
import type { MuscleGroup } from "~/schema";

export interface PrescriptionWithLogs {
  exerciseName: string;
  targetRepLow: number | null;
  targetRepHigh: number | null;
  targetRir: number | null;
  setLogs: { reps: number; achievedRir: number | null }[];
}
export interface WeekForPerformance {
  prescriptions: PrescriptionWithLogs[];
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Band one prescription's logged performance vs its targets → 0-3, or null if unjudgeable. */
function scorePrescription(rx: PrescriptionWithLogs): number | null {
  if (rx.setLogs.length === 0) return null;
  if (rx.targetRepLow === null || rx.targetRepHigh === null) return null;
  const medReps = median(rx.setLogs.map((l) => l.reps));
  const rirs = rx.setLogs.map((l) => l.achievedRir).filter((r): r is number => r !== null);
  const medRir = rirs.length ? median(rirs) : null;
  const rirOk = (slack: number) => rx.targetRir === null || medRir === null || medRir <= rx.targetRir + slack;

  if (medReps >= rx.targetRepHigh && rirOk(0)) return 3;
  if (medReps >= rx.targetRepLow && rirOk(1)) return 2;
  if (medReps >= rx.targetRepLow - 2) return 1;
  return 0;
}

/**
 * Law 1: derive per-muscle performance (0-3) from the week's SetLogs vs targets.
 * A muscle is "trained" when it is the PRIMARY of ≥1 prescription's exercise. Its
 * score is the floored mean of its judgeable prescriptions; undefined when none are.
 */
export function derivePerformance(
  week: WeekForPerformance,
  targets: ResolvedMuscleTarget[],
  library: ExerciseDef[],
): Map<MuscleGroup, number | undefined> {
  const byName = new Map(library.map((e) => [e.name, e]));
  const primaryMusclesOf = (name: string): MuscleGroup[] =>
    (byName.get(name)?.muscles ?? []).filter((m) => m.role === "PRIMARY").map((m) => m.muscle);

  const scores = new Map<MuscleGroup, number[]>();
  const trained = new Set<MuscleGroup>();

  for (const rx of week.prescriptions) {
    const muscles = primaryMusclesOf(rx.exerciseName);
    for (const m of muscles) trained.add(m);
    const score = scorePrescription(rx);
    if (score === null) continue;
    for (const m of muscles) {
      const list = scores.get(m) ?? [];
      list.push(score);
      scores.set(m, list);
    }
  }

  const targetMuscles = new Set(targets.map((t) => t.muscle));
  const out = new Map<MuscleGroup, number | undefined>();
  for (const m of trained) {
    if (!targetMuscles.has(m)) continue; // only muscles the engine tracks
    const list = scores.get(m);
    out.set(m, list?.length ? Math.floor(list.reduce((a, b) => a + b, 0) / list.length) : undefined);
  }
  return out;
}
