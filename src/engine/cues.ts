import type { ActivityIntensity, ActivityKind, Daypart, TrainingPhase } from "~/schema";
import {
  CUE_CARBS_BEFORE_G_PER_KG,
  CUE_CARBS_BETWEEN_G_PER_KG,
  CUE_HEAVY_LOWER_SETS,
  CUE_LONG_EASY_MIN,
  CUE_MAX_PER_DAY,
  CUE_PHASE_CARB_FACTOR,
  CUE_PRE_MEAL_HOURS,
  CUE_PROTEIN_G_PER_KG,
  CUE_ROUND_G,
  CUE_WEIGHT_MAX_KG,
  CUE_WEIGHT_MIN_KG,
} from "./constants";
import type { Footprint } from "./schedule";

/** A lifting session on the cue's day (or the day before), as placed. */
export interface CueLift {
  id: string;
  label: string;
  daypart: Daypart | null;
  footprint: Footprint;
}

/** Something the athlete does outside the plan. */
export interface CueActivity {
  id: string;
  kind: ActivityKind;
  intensity: ActivityIntensity;
  daypart: Daypart | null;
  durationMin: number | null;
}

/**
 * One day, as cues need it. `lifts` are the day's sessions still to train; `previous` is
 * what the day before held (sessions that were done, or are planned when that day has not
 * come yet).
 */
export interface CueDayInput {
  date: string; // "YYYY-MM-DD", the athlete's local date
  lifts: CueLift[];
  activities: CueActivity[];
  previous: { lifts: CueLift[]; activities: CueActivity[] };
  weightKg: number | null;
  phase: TrainingPhase;
}

export type CueSubject =
  | { type: "lift"; id: string; label: string }
  | { type: "activity"; id: string; kind: ActivityKind; intensity: ActivityIntensity };

/** A whole-gram range, low then high. */
export type GramRange = readonly [number, number];

export type CueFact =
  | { kind: "fuel_between"; date: string; first: CueSubject; second: CueSubject; order: "known" | "unknown"; carbsG: GramRange | null }
  | { kind: "recovery_overlap"; date: string; yesterday: CueSubject; today: CueSubject; proteinG: GramRange | null }
  | {
      kind: "heavy_lower";
      date: string;
      lift: Extract<CueSubject, { type: "lift" }>;
      lowerSets: number;
      carbsG: GramRange | null;
      mealHoursBefore: readonly [number, number];
    };

export type CueKind = CueFact["kind"];

/** Quad, hamstring and glute sets. Calves load the legs too little to count. */
export function lowerSets(footprint: Footprint): number {
  return (footprint.QUADS ?? 0) + (footprint.HAMSTRINGS ?? 0) + (footprint.GLUTES ?? 0);
}

/** A per-kg range for this athlete, rounded; null without a plausible bodyweight. */
export function gramRange(perKg: readonly [number, number], weightKg: number | null, factor: number): GramRange | null {
  if (weightKg === null || !(weightKg >= CUE_WEIGHT_MIN_KG && weightKg <= CUE_WEIGHT_MAX_KG)) return null;
  const round = (g: number) => Math.round(g / CUE_ROUND_G) * CUE_ROUND_G;
  const low = round(perKg[0] * weightKg * factor);
  return [low, Math.max(round(perKg[1] * weightKg * factor), low + CUE_ROUND_G)];
}

const demanding = (a: CueActivity) =>
  a.intensity !== "EASY" || (a.durationMin !== null && a.durationMin >= CUE_LONG_EASY_MIN);
const legLoading = (a: CueActivity) => demanding(a) && (a.kind === "RUN" || a.kind === "RIDE" || a.kind === "SPORT");
const heavyLower = (l: CueLift) => lowerSets(l.footprint) >= CUE_HEAVY_LOWER_SETS;

const liftSubject = (l: CueLift) => ({ type: "lift", id: l.id, label: l.label }) as const;
const activitySubject = (a: CueActivity): CueSubject => ({ type: "activity", id: a.id, kind: a.kind, intensity: a.intensity });

/** Every cue one day's facts support, before ranking. Deterministic for a given input order. */
export function deriveCues(input: CueDayInput): CueFact[] {
  const out: CueFact[] = [];
  const carbFactor = CUE_PHASE_CARB_FACTOR[input.phase];
  const between = gramRange(CUE_CARBS_BETWEEN_G_PER_KG, input.weightKg, carbFactor);
  const before = gramRange(CUE_CARBS_BEFORE_G_PER_KG, input.weightKg, carbFactor);
  const protein = gramRange(CUE_PROTEIN_G_PER_KG, input.weightKg, 1);

  // Two demanding things on one day: the meal between them matters.
  const fuelled = new Set<string>();
  const pair = (a: { s: CueSubject; daypart: Daypart | null }, b: { s: CueSubject; daypart: Daypart | null }) => {
    const known = a.daypart !== null && b.daypart !== null && a.daypart !== b.daypart;
    const [first, second] = known && a.daypart === "PM" ? [b, a] : [a, b];
    out.push({ kind: "fuel_between", date: input.date, first: first.s, second: second.s, order: known ? "known" : "unknown", carbsG: between });
    for (const s of [first.s, second.s]) if (s.type === "lift") fuelled.add(s.id);
  };
  for (const act of input.activities.filter(demanding)) {
    for (const lift of input.lifts) pair({ s: activitySubject(act), daypart: act.daypart }, { s: liftSubject(lift), daypart: lift.daypart });
  }
  input.lifts.forEach((a, i) => {
    for (const b of input.lifts.slice(i + 1)) pair({ s: liftSubject(a), daypart: a.daypart }, { s: liftSubject(b), daypart: b.daypart });
  });

  // Legs on consecutive days, one of them outside the gym.
  for (const lift of input.lifts.filter(heavyLower)) {
    for (const act of input.previous.activities.filter(legLoading)) {
      out.push({ kind: "recovery_overlap", date: input.date, yesterday: activitySubject(act), today: liftSubject(lift), proteinG: protein });
    }
  }
  for (const act of input.activities.filter(legLoading)) {
    for (const lift of input.previous.lifts.filter(heavyLower)) {
      out.push({ kind: "recovery_overlap", date: input.date, yesterday: liftSubject(lift), today: activitySubject(act), proteinG: protein });
    }
  }

  // A big lower-body session, unless a fuel cue already covers its meal.
  for (const lift of input.lifts.filter(heavyLower)) {
    if (fuelled.has(lift.id)) continue;
    out.push({
      kind: "heavy_lower",
      date: input.date,
      lift: liftSubject(lift),
      lowerSets: lowerSets(lift.footprint),
      carbsG: before,
      mealHoursBefore: CUE_PRE_MEAL_HOURS,
    });
  }
  return out;
}

const subjectsOf = (f: CueFact): CueSubject[] =>
  f.kind === "fuel_between" ? [f.first, f.second] : f.kind === "recovery_overlap" ? [f.yesterday, f.today] : [f.lift];

/** Stable identity: the date, the kind and the sorted ids it names. Dismissal keys on it. */
export function cueId(f: CueFact): string {
  const ids = subjectsOf(f)
    .map((s) => s.id)
    .sort()
    .join("+");
  return `${f.date}:${f.kind}:${ids}`;
}

const CUE_ORDER: Record<CueKind, number> = { fuel_between: 0, recovery_overlap: 1, heavy_lower: 2 };

/** The cues worth showing for one day, most important first. */
export function rankCues(facts: CueFact[]): CueFact[] {
  // TODO(product owner): which cue matters most on a busy day, and how many to show.
  // This placeholder ranks by kind, then by id, and keeps CUE_MAX_PER_DAY.
  return [...facts]
    .sort((a, b) => CUE_ORDER[a.kind] - CUE_ORDER[b.kind] || cueId(a).localeCompare(cueId(b)))
    .slice(0, CUE_MAX_PER_DAY);
}
