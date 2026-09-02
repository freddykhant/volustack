// src/engine/deload.ts
import type { MuscleGroup } from "~/schema";
import {
  CONSECUTIVE_FATIGUE_WEEKS,
  FATIGUE_MUSCLE_THRESHOLD,
  RECOVERY_LOW,
} from "./constants";
import type { DecisionFact } from "./facts";
import type {
  AdaptationContext,
  DeloadDecision,
  MesocyclePlan,
  WeekOutcome,
} from "./types";

export function evaluateDeload(
  plan: MesocyclePlan,
  history: WeekOutcome[],
  ctx: AdaptationContext,
): DeloadDecision {
  const facts: DecisionFact[] = [];
  const lastWeek =
    history.length > 0 ? Math.max(...history.map((h) => h.weekIndex)) : 0;
  const nextWeek = lastWeek + 1;

  if (nextWeek === plan.deloadWeekIndex) {
    facts.push({ kind: "deload_scheduled", atWeek: nextWeek });
    return { decision: "scheduled_next", facts };
  }

  if (ctx.isBeginner) {
    return { decision: "none", facts };
  }

  const recent = [...history]
    .sort((a, b) => a.weekIndex - b.weekIndex)
    .slice(-CONSECUTIVE_FATIGUE_WEEKS);

  if (recent.length === CONSECUTIVE_FATIGUE_WEEKS) {
    const fatigued = (o: WeekOutcome): MuscleGroup[] => {
      const fb = new Map((o.feedback?.muscles ?? []).map((m) => [m.muscle, m]));
      const out: MuscleGroup[] = [];
      for (const t of ctx.targets) {
        const vol = o.muscleVolume[t.muscle] ?? 0;
        const rec = fb.get(t.muscle)?.recovery;
        if (vol >= t.effectiveMrv && rec !== undefined && rec <= RECOVERY_LOW) {
          out.push(t.muscle);
        }
      }
      return out;
    };
    const w1 = fatigued(recent[0]!);
    const w2 = fatigued(recent[1]!);
    if (
      w1.length >= FATIGUE_MUSCLE_THRESHOLD &&
      w2.length >= FATIGUE_MUSCLE_THRESHOLD
    ) {
      facts.push({
        kind: "deload_recommended",
        muscles: [...w2].sort(),
        cause: "consecutive_fatigue",
      });
      return { decision: "recommend_early", facts };
    }
  }

  return { decision: "none", facts };
}
