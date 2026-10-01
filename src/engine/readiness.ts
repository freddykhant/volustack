import { round1 } from "./util";
import { RECOVERY_NEUTRAL, RECOVERY_NUDGE_MAX_FRAC, RECOVERY_WORST_N } from "./constants";

/** Weight-agnostic per-set stimulus weight by proximity to failure. */
function setWeight(achievedRir: number | null): number {
  if (achievedRir === null) return 0.7;
  if (achievedRir <= 1) return 1.0;
  if (achievedRir <= 3) return 0.7;
  return 0.4;
}

/** A session's training stimulus: Σ per-set RIR weights. Weight-agnostic (Law 1:
 * a hypertrophy fatigue proxy, in the same "sets" currency as the volume engine). */
export function sessionStimulus(sets: { achievedRir: number | null }[]): number {
  return sets.reduce((sum, s) => sum + setWeight(s.achievedRir), 0);
}

export interface LoadEvent {
  dayOffset: number; // whole days since block start
  load: number;
}
export interface WeekEnd {
  weekIndex: number;
  dayOffset: number; // block-relative last day of the week
}
export interface ReadinessSample {
  weekIndex: number;
  fitness: number;
  fatigue: number;
  form: number;
}
export interface ReadinessOpts {
  tauFit: number;
  tauFat: number;
}
const DEFAULT_OPTS: ReadinessOpts = { tauFit: 21, tauFat: 7 };

/**
 * Banister PMC on a daily grid: fitness = slow EWMA of daily load, fatigue = fast
 * EWMA, form = fitness − fatigue. Sampled at each week end. Seeds at 0 (Law 2: no
 * assumed pre-block history). Empty events ⇒ [] (caller renders "not enough data").
 */
export function computeReadiness(
  events: LoadEvent[],
  weekEnds: WeekEnd[],
  opts: ReadinessOpts = DEFAULT_OPTS,
): ReadinessSample[] {
  if (events.length === 0 || weekEnds.length === 0) return [];

  const daily = new Map<number, number>();
  for (const e of events) daily.set(e.dayOffset, (daily.get(e.dayOffset) ?? 0) + e.load);

  const kFit = 1 - Math.exp(-1 / opts.tauFit);
  const kFat = 1 - Math.exp(-1 / opts.tauFat);
  const weekAt = new Map<number, number>(); // dayOffset → weekIndex
  for (const w of weekEnds) weekAt.set(w.dayOffset, w.weekIndex);
  const maxDay = Math.max(...weekEnds.map((w) => w.dayOffset));

  let fitness = 0;
  let fatigue = 0;
  const byWeek = new Map<number, ReadinessSample>();
  for (let d = 0; d <= maxDay; d++) {
    const load = daily.get(d) ?? 0;
    fitness += (load - fitness) * kFit;
    fatigue += (load - fatigue) * kFat;
    const wk = weekAt.get(d);
    if (wk !== undefined) {
      byWeek.set(wk, {
        weekIndex: wk,
        fitness: round1(fitness),
        fatigue: round1(fatigue),
        form: round1(fitness - fatigue),
      });
    }
  }
  return weekEnds.map((w) => byWeek.get(w.weekIndex)).filter((s): s is ReadinessSample => s !== undefined);
}

/** Worst-biased weekly recovery: the mean of the RECOVERY_WORST_N least-recovered
 * muscles (or all, if fewer). null when no muscle reported a recovery value. Pure. */
export function weeklyRecoverySignal(recoveries: (number | null)[]): number | null {
  const present = recoveries.filter((r): r is number => r !== null);
  if (present.length === 0) return null;
  const worst = present.sort((a, b) => a - b).slice(0, RECOVERY_WORST_N);
  return worst.reduce((sum, r) => sum + r, 0) / worst.length;
}

/**
 * Bounded, athlete-relative corrective nudge: each week's recovery signal bends
 * that week's Fatigue (Form recomputed as fitness − fatigue'). Neutral at
 * RECOVERY_NEUTRAL; worse recovery raises Fatigue (lower Form), better lowers it.
 * Weeks absent from the map — or mapped to null — pass through unchanged (Law 2).
 * fitness is never touched; form stays === round1(fitness − fatigue). Pure.
 */
export function blendRecovery(
  samples: ReadinessSample[],
  recoveryByWeek: Map<number, number | null>,
): ReadinessSample[] {
  return samples.map((s) => {
    const r = recoveryByWeek.get(s.weekIndex);
    if (r === undefined || r === null) return s;
    const deviation = (RECOVERY_NEUTRAL - r) / RECOVERY_NEUTRAL; // r2→0, r0→+1, r3→−0.5
    const fatigue = round1(s.fatigue + deviation * RECOVERY_NUDGE_MAX_FRAC * s.fitness);
    return { weekIndex: s.weekIndex, fitness: s.fitness, fatigue, form: round1(s.fitness - fatigue) };
  });
}
