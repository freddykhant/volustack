// src/engine/step-week.ts
import {
  JOINT_PAIN,
  MRV_PROXIMITY_SETS,
  RECOVERY_LOW,
  SCORE_GOOD,
  STEP_DOWN,
  STEP_DOWN_HARD,
  STEP_UP,
  TREND_FLAT_BAND,
} from "./constants";
import type { DecisionFact } from "./facts";
import type {
  AdaptationContext,
  CheckInFeedback,
  MesocyclePlan,
  MuscleAdjustment,
  ResolvedMuscleTarget,
  StepCause,
  WeekAdjustment,
} from "./types";
import {
  isUsableNoulProposal,
  noulCloseCall,
  trendOf,
  verdictById,
  type JudgementQuestion,
  type JudgementRequest,
  type Verdict,
} from "./judgement";
import type { ReadinessSample } from "./readiness";

export function stepWeek(
  plan: MesocyclePlan,
  weekIndex: number,
  feedback: CheckInFeedback | null,
  ctx: AdaptationContext,
): WeekAdjustment {
  const facts: DecisionFact[] = [];
  const appliesTo = weekIndex + 1;
  const upcoming = plan.weeks.find((w) => w.index === appliesTo);
  const current = plan.weeks.find((w) => w.index === weekIndex);
  const upcomingIsDeload = upcoming?.isDeload ?? false;
  const fbByMuscle = new Map(
    (feedback?.muscles ?? []).map((m) => [m.muscle, m]),
  );

  const adjustments: MuscleAdjustment[] = [];
  let anyHigh = false;

  for (const t of ctx.targets) {
    const plannedNext =
      upcoming?.muscleVolume[t.muscle] ?? current?.muscleVolume[t.muscle] ?? 0;
    const currentVol = current?.muscleVolume[t.muscle] ?? 0;
    const fb = fbByMuscle.get(t.muscle);
    const rec = fb?.recovery;
    const perf = fb?.performance;
    const joint = fb?.joint;

    let delta = 0;
    let cause: StepCause = "default_progression";
    let swap = false;

    if (!upcoming || upcomingIsDeload || fb === undefined) {
      cause = "default_progression";
    } else if (joint !== undefined && joint >= JOINT_PAIN) {
      delta = -STEP_DOWN_HARD;
      swap = true;
      cause = "joint_stress";
    } else if (rec !== undefined && rec <= RECOVERY_LOW) {
      delta = plannedNext >= t.mav ? -STEP_DOWN_HARD : -STEP_DOWN;
      cause = "under_recovered";
    } else if (
      rec !== undefined && perf !== undefined &&
      rec >= SCORE_GOOD && perf >= SCORE_GOOD &&
      plannedNext < t.effectiveMrv - 1
    ) {
      delta = STEP_UP;
      cause = "responding_well";
    } else if (
      rec !== undefined && perf !== undefined &&
      rec >= SCORE_GOOD && perf >= SCORE_GOOD &&
      plannedNext > t.effectiveMrv - MRV_PROXIMITY_SETS
    ) {
      cause = "approaching_mrv";
    } else {
      cause = "on_track";
    }

    let adjusted = plannedNext + delta;
    if (adjusted > t.effectiveMrv) adjusted = t.effectiveMrv;
    if (!upcomingIsDeload && adjusted < t.mev) adjusted = t.mev;

    facts.push({ kind: "stepped", muscle: t.muscle, from: plannedNext, to: adjusted, cause });
    if (swap) facts.push({ kind: "swap_suggested", muscle: t.muscle, cause: "joint_stress" });

    adjustments.push({
      muscle: t.muscle,
      plannedSets: plannedNext,
      adjustedSets: adjusted,
      delta: adjusted - plannedNext,
      cause,
      swapCandidate: swap,
    });

    // flaggedNow reflects the COMPLETED week's feedback (spec §6) and must be
    // evaluated unconditionally — even when the upcoming week is the deload
    // or there is no upcoming week — so it never silently drops the safety
    // signal. crossesMav/nearMrv describe the UPCOMING ramp, so they stay
    // gated on a real non-deload upcoming week.
    const flaggedNow =
      (joint !== undefined && joint >= JOINT_PAIN) ||
      (rec !== undefined && rec <= RECOVERY_LOW);
    if (flaggedNow) anyHigh = true;

    if (upcoming && !upcomingIsDeload) {
      const crossesMav = currentVol < t.mav && plannedNext >= t.mav;
      const nearMrv = plannedNext >= t.effectiveMrv - MRV_PROXIMITY_SETS;
      if (crossesMav || nearMrv) anyHigh = true;
    }
  }

  return {
    fromWeekIndex: weekIndex,
    appliesToWeekIndex: appliesTo,
    adjustments,
    checkInValue: anyHigh ? "high" : "low",
    facts,
  };
}

export function progressionNoulId(muscle: string): string {
  return `responds_well_${muscle}`;
}

/** Jev is consulted ONLY here: the residue left after the safety floors and the numeric
 * proximity test have had their say. `joint_stress` and `under_recovered` are clinical
 * guards; `approaching_mrv` is arithmetic jev-1.13 cannot do; `default_progression` is
 * structural. All four stand un-overridably. */
function isAmbiguous(a: MuscleAdjustment): boolean {
  return a.cause === "responding_well" || a.cause === "on_track";
}

function headroom(a: MuscleAdjustment, t: ResolvedMuscleTarget): "none" | "small" | "ample" {
  const gap = t.effectiveMrv - a.plannedSets;
  if (gap <= 0) return "none";
  if (gap <= MRV_PROXIMITY_SETS) return "small";
  return "ample";
}

const RECOVERY_WORDS = ["0 — still wrecked", "1 — sore and sluggish", "2 — recovered well", "3 — fully fresh"];
const JOINT_WORDS = ["0 — no joint complaints", "1 — mild niggle", "2 — painful", "3 — very painful"];
const PERF_WORDS = ["0 — regressed", "1 — flat", "2 — progressing", "3 — strong progression"];

function word(table: string[], level: number | undefined): string {
  if (level === undefined || !Number.isInteger(level) || level < 0 || level >= table.length) return "not reported";
  return table[level]!;
}

/**
 * One noul per ambiguous muscle, over one shared state. Ordinal check-in levels are
 * spelled out in words because the model reads them as text, not as ordered quantities.
 */
export function progressionQuestions(
  adj: WeekAdjustment,
  ctx: AdaptationContext,
  feedback: CheckInFeedback | null,
  readiness: ReadinessSample[],
  recoveryByWeek: ReadonlyMap<number, number | null>,
): JudgementRequest {
  const targetByMuscle = new Map(ctx.targets.map((t) => [t.muscle, t]));
  const fbByMuscle = new Map((feedback?.muscles ?? []).map((m) => [m.muscle, m]));
  const ambiguous = adj.adjustments.filter(isAmbiguous);

  const muscles: Record<string, unknown> = {};
  for (const a of adj.adjustments) {
    const t = targetByMuscle.get(a.muscle);
    const fb = fbByMuscle.get(a.muscle);
    muscles[a.muscle] = {
      headroomToCeiling: t ? headroom(a, t) : "unknown",
      recovery: word(RECOVERY_WORDS, fb?.recovery),
      jointStress: word(JOINT_WORDS, fb?.joint),
      performance: word(PERF_WORDS, fb?.performance),
    };
  }

  const recoverySeries = [...recoveryByWeek.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, v]) => v)
    .filter((v): v is number => v !== null);

  const state = {
    block: {
      weeksRemaining: Math.max(0, ctx.blockLengthWeeks - adj.appliesToWeekIndex + 1),
      upcomingWeekIndex: adj.appliesToWeekIndex,
    },
    muscles,
    readiness: {
      formTrend: trendOf(readiness.map((r) => r.form), TREND_FLAT_BAND),
      recoveryTrend: trendOf(recoverySeries, TREND_FLAT_BAND),
    },
  };

  const questions: JudgementQuestion[] = ambiguous.map((a) => ({
    id: progressionNoulId(a.muscle),
    kind: "noul",
    authority: "PROPOSAL",
    instructions:
      `A strength athlete just finished a training week. For ${a.muscle} specifically, read ` +
      `\`muscles.${a.muscle}\` for how recovered that muscle was, whether the joints involved ` +
      `complained, how performance moved, and how much room is left before their ceiling; and ` +
      `\`readiness\` for whether they are freshening or fatiguing overall. Does ${a.muscle} ` +
      `justify adding training volume next week?`,
    criteria: {
      true: `${a.muscle} recovered and performed well enough that more volume should drive further progress.`,
      false: `Hold ${a.muscle} where it is — more volume would not be productive yet.`,
    },
  }));

  return { subject: "progression", state, questions };
}

/**
 * PROPOSAL applier. A cleared noul relabels the cause `responding_well`; the ENGINE then
 * computes the delta from its own STEP_UP constant and clamps to the athlete's landmarks.
 * Jev never names a set count. Preempted muscles are untouchable by construction: they
 * were never asked about, and `isAmbiguous` gates the write too.
 */
export function applyProgressionVerdicts(
  adj: WeekAdjustment,
  ctx: AdaptationContext,
  verdicts: Verdict[],
): WeekAdjustment {
  if (verdicts.length === 0) return adj;
  const targetByMuscle = new Map(ctx.targets.map((t) => [t.muscle, t]));
  const facts: DecisionFact[] = [];

  const adjustments = adj.adjustments.map((a) => {
    if (!isAmbiguous(a)) return a;
    const v = verdictById(verdicts, progressionNoulId(a.muscle));
    // Computed BEFORE the gate check, from the un-narrowed `v`: `isUsableNoulProposal`'s
    // type predicate is `v is Extract<Verdict, {kind:"noul"}>`, so TS narrows the
    // negated branch to exclude "noul" entirely — a noul that merely fails the proposal
    // gate would be type-invisible as a noul inside that branch. Checking the close
    // call here, before the gate, sidesteps that and is equivalent: the close-call band
    // (|noul-0.5| < CLOSE_CALL_NOUL_MARGIN) and the proposal gate (noul >= 0.75) don't
    // overlap, so this fires exactly when the gated check below would have.
    if (v?.kind === "noul" && noulCloseCall(v.noul)) {
      facts.push({
        kind: "close_call", subject: "progression", questionId: progressionNoulId(a.muscle),
        between: ["responding_well", "on_track"], margin: Math.round(Math.abs(v.noul - 0.5) * 100) / 100,
      });
    }
    if (!isUsableNoulProposal(v)) {
      return a;
    }

    // Fail closed: a verdict we cannot bound is a verdict we do not apply. `adj` and
    // `ctx` can disagree about which muscles exist under the stale/replayed-verdict
    // threat model, so a missing target must block the write entirely — not just skip
    // the clamp while the unbounded +1 still lands.
    const t = targetByMuscle.get(a.muscle);
    if (!t) return a;
    // Mirror stepWeek's own `responding_well` eligibility (step-week.ts:76): a muscle
    // sitting within MRV_PROXIMITY_SETS - 1 of its ceiling is never stepped up by the
    // deterministic engine, so a cleared verdict must not step it up here either —
    // that would push it into the MRV-proximity zone spec §7.1 reserves for the engine.
    if (!(a.plannedSets < t.effectiveMrv - 1)) return a;
    let adjusted = a.plannedSets + STEP_UP;
    if (adjusted > t.effectiveMrv) adjusted = t.effectiveMrv;
    if (adjusted < t.mev) adjusted = t.mev;

    facts.push({
      kind: "judged", subject: "progression", questionId: progressionNoulId(a.muscle),
      selected: "responding_well", deterministic: a.cause,
      basis: { kind: "noul", value: v.noul },
    });

    return { ...a, cause: "responding_well" as const, adjustedSets: adjusted, delta: adjusted - a.plannedSets };
  });

  return { ...adj, adjustments, facts: [...adj.facts, ...facts] };
}
