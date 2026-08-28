// src/engine/generate.ts
import type { ExerciseDef } from "~/domain/exercise-library";
import {
  COMPOUND_REPS,
  COMPOUND_RIR,
  DELOAD_FRACTION,
  DELOAD_RIR,
  ISOLATION_REPS,
  ISOLATION_RIR,
  RAMP_START_FRACTION,
} from "./constants";
import { distributeVolume } from "./distribute";
import type { DecisionFact } from "./facts";
import { buildSessionSlots } from "./split";
import { sessionMinutes } from "./time";
import type {
  ExerciseAssignment,
  LandmarkMap,
  MesocyclePlan,
  PrescriptionPlan,
  ResolvedSpec,
  SessionPlan,
  WeekPlan,
} from "./types";
import { computeVolume, roundVolumeMap } from "./util";

export function generateMesocycle(
  spec: ResolvedSpec,
  library: ExerciseDef[],
  _landmarks: LandmarkMap,
): MesocyclePlan {
  const slots = buildSessionSlots(spec.splitType, spec.daysPerWeek);
  const template = distributeVolume(spec, library, slots); // peak week
  const byName = new Map(library.map((e) => [e.name, e]));
  const facts: DecisionFact[] = [...spec.facts, ...template.facts];

  const allWeeks = Array.from({ length: spec.blockLengthWeeks }, (_, i) => i + 1);
  const accumWeeks = allWeeks.filter((i) => i !== spec.deloadWeekIndex);

  const week1Fraction = spec.isBeginner ? 1 : RAMP_START_FRACTION;

  function fractionForWeek(index: number): number {
    if (index === spec.deloadWeekIndex) return DELOAD_FRACTION * week1Fraction;
    if (spec.isBeginner || accumWeeks.length === 1) return 1;
    const rank = accumWeeks.indexOf(index); // 0-based among accumulation weeks
    return RAMP_START_FRACTION + (1 - RAMP_START_FRACTION) * (rank / (accumWeeks.length - 1));
  }

  function scaleAssignment(a: ExerciseAssignment, fraction: number): ExerciseAssignment {
    return { exerciseName: a.exerciseName, sets: Math.max(1, Math.round(a.sets * fraction)) };
  }

  /** Bring any muscle below its MEV back up by adding sets to its largest primary
   * assignment (honors week 1 = max(MEV, 75%·peak)). Accumulation weeks only. */
  function applyMevFloor(assignments: ExerciseAssignment[]): void {
    for (const t of spec.targets) {
      let vol = computeVolume(assignments, library)[t.muscle];
      if (vol >= t.mev) continue;
      const primaries = assignments
        .filter((a) => byName.get(a.exerciseName)?.muscles.some((m) => m.muscle === t.muscle && m.role === "PRIMARY"))
        .sort((a, b) => b.sets - a.sets || a.exerciseName.localeCompare(b.exerciseName));
      const target = primaries[0];
      if (!target) continue;
      let guard = 0;
      while (vol < t.mev && guard++ < 50) {
        target.sets += 1;
        vol = computeVolume(assignments, library)[t.muscle];
      }
    }
  }

  function prescribe(a: ExerciseAssignment, isDeload: boolean): PrescriptionPlan {
    const iso = byName.get(a.exerciseName)?.movementPattern === "ISOLATION";
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

  function clampToMrv(assignments: ExerciseAssignment[], weekIndex: number, isDeload: boolean): void {
    if (isDeload) return;
    for (const t of spec.targets) {
      let vol = computeVolume(assignments, library)[t.muscle];
      if (vol <= t.effectiveMrv) continue;
      const isos = assignments
        .filter((a) => byName.get(a.exerciseName)?.movementPattern === "ISOLATION" && byName.get(a.exerciseName)?.muscles.some((m) => m.muscle === t.muscle && m.role === "PRIMARY"))
        .sort((a, b) => b.sets - a.sets || a.exerciseName.localeCompare(b.exerciseName));
      let guard = 0;
      for (const iso of isos) {
        while (vol > t.effectiveMrv && iso.sets > 1 && guard++ < 50) {
          iso.sets -= 1;
          vol = computeVolume(assignments, library)[t.muscle];
        }
      }
      if (vol > t.effectiveMrv) {
        facts.push({ kind: "ramp_flattened", muscle: t.muscle, atWeek: weekIndex, cappedAt: t.effectiveMrv, cause: "mrv_ceiling" });
      }
    }
  }

  const weeks: WeekPlan[] = allWeeks.map((index) => {
    const isDeload = index === spec.deloadWeekIndex;
    const fraction = fractionForWeek(index);

    const sessions: SessionPlan[] = template.sessions.map((s) => {
      const scaled = s.exercises.map((a) => scaleAssignment(a, fraction));
      if (!isDeload) applyMevFloor(scaled);
      // clamp to effective MRV: if scaling/flooring pushed a muscle over, drop isolation sets
      clampToMrv(scaled, index, isDeload);
      return {
        slotId: s.slotId,
        label: s.label,
        prescriptions: scaled.map((a) => prescribe(a, isDeload)),
        estimatedMinutes: sessionMinutes(scaled),
      };
    });

    const weekAssignments = sessions.flatMap((s) =>
      s.prescriptions.map((p) => ({ exerciseName: p.exerciseName, sets: p.sets })),
    );
    return {
      index,
      isDeload,
      sessions,
      muscleVolume: roundVolumeMap(computeVolume(weekAssignments, library)),
    };
  });

  return {
    splitType: spec.splitType,
    blockLengthWeeks: spec.blockLengthWeeks,
    deloadWeekIndex: spec.deloadWeekIndex,
    weeks,
    facts,
  };
}
