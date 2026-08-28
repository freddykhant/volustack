// src/engine/distribute.ts
import type { ExerciseDef } from "~/domain/exercise-library";
import type { MuscleGroup } from "~/schema";
import { FREQUENCY_THRESHOLD_SETS, PER_SET_MIN, SETUP_MIN } from "./constants";
import type { DecisionFact } from "./facts";
import { sessionMinutes } from "./time";
import type {
  ExerciseAssignment,
  ResolvedSpec,
  SessionSlot,
  SessionTemplate,
  WeekTemplate,
} from "./types";
import { computeVolume, emptyVolumeMap, round1, roundVolumeMap } from "./util";

export function distributeVolume(
  spec: ResolvedSpec,
  library: ExerciseDef[],
  slots: SessionSlot[],
): WeekTemplate {
  const facts: DecisionFact[] = [];
  const excluded = new Set(spec.excludedExerciseNames);
  const pool = library.filter((e) => !excluded.has(e.name));
  const byName = new Map(pool.map((e) => [e.name, e]));
  const bySlot = new Map<string, ExerciseAssignment[]>(slots.map((s) => [s.id, []]));
  const achieved = emptyVolumeMap();

  const targetOf = (m: MuscleGroup): number =>
    spec.targets.find((t) => t.muscle === m)?.weeklySetTarget ?? 0;
  const remainingNeed = (m: MuscleGroup): number => targetOf(m) - achieved[m];
  const slotsForMuscle = (m: MuscleGroup): SessionSlot[] =>
    slots.filter((s) => s.eligibleMuscles.includes(m));
  const slotMinutes = (slotId: string): number => sessionMinutes(bySlot.get(slotId)!);

  function creditSets(ex: ExerciseDef, sets: number): void {
    for (const mm of ex.muscles) achieved[mm.muscle] += sets * mm.fraction;
  }

  function addAssignment(slotId: string, name: string, sets: number): void {
    const list = bySlot.get(slotId)!;
    const existing = list.find((a) => a.exerciseName === name);
    if (existing) existing.sets += sets;
    else list.push({ exerciseName: name, sets });
  }

  /** Best PRIMARY exercise for a muscle: compounds first, then those whose
   *  secondary credit pays still-unmet targets, then name asc. */
  function pickExercise(m: MuscleGroup): ExerciseDef | null {
    if (slotsForMuscle(m).length === 0) return null;
    const cands = pool.filter((e) =>
      e.muscles.some((mm) => mm.muscle === m && mm.role === "PRIMARY"),
    );
    if (cands.length === 0) return null;
    const unmetCredit = (e: ExerciseDef): number =>
      e.muscles
        .filter((mm) => mm.role === "SECONDARY" && remainingNeed(mm.muscle) > 0)
        .reduce((s, mm) => s + mm.fraction, 0);
    return [...cands].sort((a, b) => {
      const ca = a.movementPattern === "ISOLATION" ? 0 : 1;
      const cb = b.movementPattern === "ISOLATION" ? 0 : 1;
      return cb - ca || unmetCredit(b) - unmetCredit(a) || a.name.localeCompare(b.name);
    })[0]!;
  }

  /** Distribute `total` whole sets across the least-loaded eligible slots,
   *  using at least `minSessions` distinct sessions where possible. */
  function distributeAcross(
    total: number,
    eligible: SessionSlot[],
    minSessions: number,
  ): { slotId: string; sets: number }[] {
    const ordered = [...eligible].sort(
      (a, b) => slotMinutes(a.id) - slotMinutes(b.id) || a.id.localeCompare(b.id),
    );
    const n = Math.min(Math.max(minSessions, 1), ordered.length);
    const chosen = ordered.slice(0, Math.max(n, 1));
    const out = new Map<string, number>(chosen.map((s) => [s.id, 0]));
    for (let placed = 0; placed < total; placed++) {
      const slot = chosen[placed % chosen.length]!;
      out.set(slot.id, out.get(slot.id)! + 1);
    }
    return [...out.entries()].map(([slotId, sets]) => ({ slotId, sets }));
  }

  // ---- greedy allocation (spec.targets is pre-sorted priority/target/name) ----
  for (const t of spec.targets) {
    const need = remainingNeed(t.muscle);
    if (need < 1) continue; // secondary credit may already satisfy it
    const ex = pickExercise(t.muscle);
    if (!ex) {
      facts.push({
        kind: "deviation",
        muscle: t.muscle,
        target: targetOf(t.muscle),
        achieved: round1(achieved[t.muscle]),
        cause: "no_eligible_exercise",
      });
      continue;
    }
    const eligible = slotsForMuscle(t.muscle);
    const setsToPlace = Math.round(need);
    const minSessions =
      setsToPlace >= FREQUENCY_THRESHOLD_SETS && eligible.length >= 2 ? 2 : 1;
    const spread = distributeAcross(setsToPlace, eligible, minSessions);
    for (const { slotId, sets } of spread) {
      if (sets <= 0) continue;
      addAssignment(slotId, ex.name, sets);
      creditSets(ex, sets);
    }
    const usedSessions = spread.filter((x) => x.sets > 0).map((x) => x.slotId);
    if (minSessions === 2 && usedSessions.length >= 2) {
      facts.push({ kind: "split_volume", muscle: t.muscle, sessions: usedSessions, cause: "frequency_floor" });
    }
  }

  // ---- repair: time-cap ----
  let guard = 0;
  while (guard++ < 200) {
    const over = slots
      .map((s) => s.id)
      .filter((id) => slotMinutes(id) > spec.sessionLengthCapMin)
      .sort((a, b) => slotMinutes(b) - slotMinutes(a) || a.localeCompare(b));
    if (over.length === 0) break;
    const fromId = over[0]!;
    const list = bySlot.get(fromId)!;
    if (list.length === 0) break;
    const movable = [...list].sort(
      (a, b) => b.sets - a.sets || a.exerciseName.localeCompare(b.exerciseName),
    )[0]!;
    const ex = byName.get(movable.exerciseName)!;
    const primary = ex.muscles.find((mm) => mm.role === "PRIMARY")!.muscle;
    const dest = slotsForMuscle(primary)
      .filter((s) => s.id !== fromId)
      .sort((a, b) => slotMinutes(a.id) - slotMinutes(b.id) || a.id.localeCompare(b.id))[0];

    movable.sets -= 1;
    if (movable.sets === 0) list.splice(list.indexOf(movable), 1);

    if (dest && slotMinutes(dest.id) + SETUP_MIN + PER_SET_MIN <= spec.sessionLengthCapMin) {
      addAssignment(dest.id, ex.name, 1);
      facts.push({ kind: "moved_sets", muscle: primary, from: fromId, to: dest.id, count: 1, cause: "session_time_cap" });
    } else {
      creditSets(ex, -1); // dropped — no room anywhere
      facts.push({
        kind: "deviation",
        muscle: primary,
        target: targetOf(primary),
        achieved: round1(achieved[primary]),
        cause: "session_time_cap",
      });
    }
  }

  // ---- residual: any session still over cap after the repair pass above is a genuine
  // infeasibility (repair converged short, hit its guard, or ran out of movable sets). ----
  for (const s of slots) {
    const minutes = slotMinutes(s.id);
    if (minutes > spec.sessionLengthCapMin) {
      facts.push({
        kind: "infeasible",
        constraint: "session_time",
        detail: { session: s.id, requiredMin: minutes, capMin: spec.sessionLengthCapMin },
      });
    }
  }

  // ---- repair: overshoot trim (fractional credit pushed a muscle past target + 0.5) ----
  for (const t of spec.targets) {
    if (achieved[t.muscle] - t.weeklySetTarget <= 0.5) continue;
    const before = round1(achieved[t.muscle]);
    for (const [, list] of bySlot) {
      for (const a of list) {
        const ex = byName.get(a.exerciseName)!;
        const prim = ex.muscles.find((mm) => mm.role === "PRIMARY");
        if (prim?.muscle !== t.muscle || ex.movementPattern !== "ISOLATION") continue;
        while (achieved[t.muscle] - t.weeklySetTarget > 0.5 && a.sets > 0) {
          a.sets -= 1;
          creditSets(ex, -1);
        }
      }
    }
    // remove any emptied assignments
    for (const [, list] of bySlot) {
      for (let i = list.length - 1; i >= 0; i--) if (list[i]!.sets === 0) list.splice(i, 1);
    }
    if (round1(achieved[t.muscle]) < before) {
      facts.push({ kind: "trimmed_overshoot", muscle: t.muscle, from: before, to: round1(achieved[t.muscle]), cause: "secondary_credit_overshoot" });
    }
  }

  // ---- residual deviations (targeted muscles still off by > 0.5) ----
  for (const t of spec.targets) {
    const dev = achieved[t.muscle] - t.weeklySetTarget;
    if (Math.abs(dev) <= 0.5) continue;
    facts.push({
      kind: "deviation",
      muscle: t.muscle,
      target: t.weeklySetTarget,
      achieved: round1(achieved[t.muscle]),
      cause: dev > 0 ? "secondary_credit_overshoot" : "insufficient_capacity",
    });
  }

  const sessions: SessionTemplate[] = slots.map((s) => {
    const exercises = bySlot.get(s.id)!;
    return {
      slotId: s.id,
      label: s.label,
      exercises,
      estimatedMinutes: sessionMinutes(exercises),
    };
  });

  // Recompute from assignments so achievedVolume always matches what's on the page.
  const allAssignments = sessions.flatMap((s) => s.exercises);
  return {
    sessions,
    achievedVolume: roundVolumeMap(computeVolume(allAssignments, pool)),
    facts,
  };
}
