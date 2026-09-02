// src/engine/generate.ts
import type { ExerciseDef } from "~/domain/exercise-library";
import {
  COMPOUND_REPS,
  COMPOUND_RIR,
  DELOAD_FRACTION,
  DELOAD_RIR,
  ISOLATION_REPS,
  ISOLATION_RIR,
  PER_SET_MIN,
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
import { computeVolume, round1, roundVolumeMap } from "./util";

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
  const peakWeekIndex = accumWeeks.length > 0 ? accumWeeks[accumWeeks.length - 1] : undefined;

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

  /** Bring any muscle below its MEV back up by adding sets, spread across sessions
   * that (a) carry a PRIMARY assignment for the muscle and (b) have time-cap headroom
   * for one more set, favoring the least-loaded eligible session each iteration.
   * Accumulation weeks only. Operates on the WEEK-AGGREGATED volume (all sessions),
   * since MEV/MRV are weekly targets and a single session's slice is never
   * representative — but each individual set added must respect that session's own
   * time cap, since Law 1 (never silently blow the time cap) outranks the MEV floor.
   * Emits `raised_to_mev` when it moves volume, and additionally a `deviation` fact
   * when the cap prevented reaching MEV in full. */
  function applyMevFloor(scaledSessions: { slotId: string; label: string; exercises: ExerciseAssignment[] }[]): void {
    for (const t of spec.targets) {
      const weekAssignments = scaledSessions.flatMap((s) => s.exercises);
      let vol = computeVolume(weekAssignments, library)[t.muscle];
      if (vol >= t.mev) continue;
      const from = vol;
      let guard = 0;
      while (vol < t.mev && guard++ < 100) {
        const eligible = scaledSessions.filter((s) => {
          const hasPrimary = s.exercises.some(
            (a) => byName.get(a.exerciseName)?.muscles.some((m) => m.muscle === t.muscle && m.role === "PRIMARY"),
          );
          if (!hasPrimary) return false;
          return sessionMinutes(s.exercises) + PER_SET_MIN <= spec.sessionLengthCapMin;
        });
        if (eligible.length === 0) break;
        eligible.sort(
          (a, b) => sessionMinutes(a.exercises) - sessionMinutes(b.exercises) || a.slotId.localeCompare(b.slotId),
        );
        const session = eligible[0]!;
        const primaries = session.exercises
          .filter((a) => byName.get(a.exerciseName)?.muscles.some((m) => m.muscle === t.muscle && m.role === "PRIMARY"))
          .sort((a, b) => b.sets - a.sets || a.exerciseName.localeCompare(b.exerciseName));
        const target = primaries[0]!;
        target.sets += 1;
        vol = computeVolume(scaledSessions.flatMap((s) => s.exercises), library)[t.muscle];
      }
      if (vol > from) {
        facts.push({ kind: "raised_to_mev", muscle: t.muscle, from: round1(from), to: round1(vol), cause: "mev_floor" });
      }
      if (vol < t.mev) {
        facts.push({ kind: "deviation", muscle: t.muscle, target: t.mev, achieved: round1(vol), cause: "session_time_cap" });
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

  /** Clamp a muscle's WEEK-AGGREGATED volume down to its effective MRV by trimming
   * isolation sets. Called on accumulation weeks only (deload never exceeds MRV). */
  function clampToMrv(assignments: ExerciseAssignment[], weekIndex: number): void {
    for (const t of spec.targets) {
      let vol = computeVolume(assignments, library)[t.muscle];
      if (vol <= t.effectiveMrv) continue;
      const isos = assignments
        .filter((a) => byName.get(a.exerciseName)?.movementPattern === "ISOLATION" && byName.get(a.exerciseName)?.muscles.some((m) => m.muscle === t.muscle && m.role === "PRIMARY"))
        .sort((a, b) => b.sets - a.sets || a.exerciseName.localeCompare(b.exerciseName));
      let guard = 0;
      for (const iso of isos) {
        while (vol > t.effectiveMrv && iso.sets > 1 && guard++ < 100) {
          iso.sets -= 1;
          vol = computeVolume(assignments, library)[t.muscle];
        }
      }
      if (vol > t.effectiveMrv) {
        facts.push({ kind: "ramp_flattened", muscle: t.muscle, atWeek: weekIndex, cappedAt: t.effectiveMrv, cause: "mrv_ceiling" });
      }
    }
  }

  /** Peak week = last accumulation week (ramp reaches 1.0 there). Only at the peak does
   * a muscle's volume have a meaningful target to compare against (ramp weeks are
   * *intentionally* below it). floor/clamp above raise or trim sets on a muscle's own
   * primary/isolation exercises for the muscle they're solving for, but those exercises
   * often carry SECONDARY credit into other muscles — e.g. raising Barbell Row sets to
   * float BACK to its MEV also feeds REAR_DELTS. That collateral shift is still a
   * mutation this engine made, so Law 2 requires it to carry a reason even though
   * neither floor nor clamp was "about" that muscle. This closing sweep catches any
   * targeted muscle left off-target at peak with no fact yet mentioning it. */
  function checkResidualDeviations(assignments: ExerciseAssignment[]): void {
    const vol = computeVolume(assignments, library);
    for (const t of spec.targets) {
      const dev = vol[t.muscle] - t.weeklySetTarget;
      if (Math.abs(dev) <= 0.5) continue;
      const explained = facts.some((f) => "muscle" in f && f.muscle === t.muscle);
      if (explained) continue;
      facts.push({
        kind: "deviation",
        muscle: t.muscle,
        target: t.weeklySetTarget,
        achieved: round1(vol[t.muscle]),
        cause: dev > 0 ? "secondary_credit_overshoot" : "insufficient_capacity",
      });
    }
  }

  const weeks: WeekPlan[] = allWeeks.map((index) => {
    const isDeload = index === spec.deloadWeekIndex;
    const fraction = fractionForWeek(index);

    // Scale every session; collect assignment refs so week-level floor/clamp
    // mutate through the same objects the sessions hold.
    const scaledSessions = template.sessions.map((s) => ({
      slotId: s.slotId,
      label: s.label,
      exercises: s.exercises.map((a) => scaleAssignment(a, fraction)),
    }));
    const weekAssignments = scaledSessions.flatMap((s) => s.exercises);

    if (!isDeload) {
      applyMevFloor(scaledSessions);
      clampToMrv(weekAssignments, index);
      if (index === peakWeekIndex) checkResidualDeviations(weekAssignments);
    }

    const sessions: SessionPlan[] = scaledSessions.map((s) => ({
      slotId: s.slotId,
      label: s.label,
      prescriptions: s.exercises.map((a) => prescribe(a, isDeload)),
      estimatedMinutes: sessionMinutes(s.exercises),
    }));

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
