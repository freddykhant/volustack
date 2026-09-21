import { round1 } from "./util";

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
