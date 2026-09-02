// src/engine/resolve-constraints.ts
import type { ConstraintSetInput, MuscleTargetInput } from "~/schema";
import { PER_SET_MIN, PHASE_FACTOR, WARMUP_MIN } from "./constants";
import type { DecisionFact } from "./facts";
import { buildSessionSlots } from "./split";
import type {
  AthleteContext,
  ResolvedMuscleTarget,
  ResolveResult,
} from "./types";
import { ALL_MUSCLES } from "./util";

export function resolveConstraints(
  input: ConstraintSetInput,
  athlete: AthleteContext,
): ResolveResult {
  const facts: DecisionFact[] = [];
  const isBeginner = athlete.experienceLevel === "BEGINNER";
  const phaseFactor = PHASE_FACTOR[athlete.phase];
  const provided = new Map<string, MuscleTargetInput>(
    input.muscleTargets.map((t) => [t.muscle, t]),
  );

  const targets: ResolvedMuscleTarget[] = ALL_MUSCLES.map((muscle) => {
    const lm = athlete.landmarks[muscle];
    const effectiveMrv = Math.round(lm.mrv * phaseFactor);
    if (effectiveMrv !== lm.mrv) {
      facts.push({ kind: "phase_modulated", muscle, baseMrv: lm.mrv, effectiveMrv, phaseFactor });
    }

    if (isBeginner) {
      return {
        muscle,
        weeklySetTarget: Math.round((lm.mev + lm.mav) / 2),
        priority: 0,
        mev: lm.mev,
        mav: lm.mav,
        effectiveMrv,
      };
    }

    const p = provided.get(muscle);
    if (p?.weeklySetTarget != null) {
      let weeklySetTarget = p.weeklySetTarget;
      if (weeklySetTarget > effectiveMrv) {
        facts.push({ kind: "clamped_to_mrv", muscle, requested: weeklySetTarget, effectiveMrv });
        weeklySetTarget = effectiveMrv;
      }
      return { muscle, weeklySetTarget, priority: p.priority, mev: lm.mev, mav: lm.mav, effectiveMrv };
    }

    // Untargeted → maintenance at MEV.
    facts.push({ kind: "filled_default", muscle, setTarget: lm.mev, cause: "unspecified_target" });
    return { muscle, weeklySetTarget: lm.mev, priority: p?.priority ?? 0, mev: lm.mev, mav: lm.mav, effectiveMrv };
  });

  if (isBeginner) {
    facts.push({ kind: "beginner_locked", detail: "flat volume at MEV–MAV midpoint; progression via load/reps, not set counts" });
  }

  targets.sort(
    (a, b) =>
      b.priority - a.priority ||
      b.weeklySetTarget - a.weeklySetTarget ||
      a.muscle.localeCompare(b.muscle),
  );

  // Feasibility precheck: conservative lower bound on weekly minutes.
  // Even ignoring per-exercise setup time, warmups + all sets must fit the budget.
  const totalSets = targets.reduce((s, t) => s + t.weeklySetTarget, 0);
  const requiredMin = WARMUP_MIN * input.daysPerWeek + totalSets * PER_SET_MIN;
  const capMin = input.daysPerWeek * input.sessionLengthCapMin;
  if (requiredMin > capMin) {
    facts.push({
      kind: "infeasible",
      constraint: "session_time",
      detail: { requiredMin, capMin, totalSets, daysPerWeek: input.daysPerWeek },
    });
    return { kind: "infeasible", facts };
  }

  // Sanity check that the split geometry builds (throws would be a bug, not infeasibility).
  buildSessionSlots(input.splitType, input.daysPerWeek);

  return {
    kind: "resolved",
    daysPerWeek: input.daysPerWeek,
    splitType: input.splitType,
    sessionLengthCapMin: input.sessionLengthCapMin,
    blockLengthWeeks: input.blockLengthWeeks,
    deloadWeekIndex: input.deloadWeekIndex ?? input.blockLengthWeeks,
    isBeginner,
    targets,
    excludedExerciseNames: input.excludedExerciseNames,
    facts,
  };
}
