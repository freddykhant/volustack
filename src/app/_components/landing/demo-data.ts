/**
 * Illustrative numbers for the landing's product replicas. Not engine output, but shaped like it:
 * volume climbs through the block, deloads to about half its peak, and the readiness series ends
 * somewhere the app's own banding calls Productive. `demo-data.test.ts` keeps them honest.
 */

export type Zone = "building" | "optimal" | "max";

export const BLOCK_GRID: { muscle: string; weeks: number[]; deload: number }[] = [
  { muscle: "Chest", weeks: [10, 12, 14, 16, 18], deload: 8 },
  { muscle: "Back", weeks: [12, 14, 16, 17, 19], deload: 9 },
  { muscle: "Quads", weeks: [8, 10, 12, 14, 15], deload: 7 },
  { muscle: "Side delts", weeks: [14, 16, 18, 20, 22], deload: 10 },
];

// Where each muscle's optimal and max zones start, in sets per week.
const ZONES: Record<string, { optimal: number; max: number }> = {
  Chest: { optimal: 11, max: 18 },
  Back: { optimal: 10, max: 19 },
  Quads: { optimal: 11, max: 18 },
  "Side delts": { optimal: 12, max: 20 },
};

export function zoneFor(sets: number, muscle: string): Zone {
  const z = ZONES[muscle];
  if (!z) throw new Error(`No zones for ${muscle}`);
  return sets >= z.max ? "max" : sets >= z.optimal ? "optimal" : "building";
}

/** Weekly samples, with form = fitness − fatigue as in the app's model. */
export const READINESS_SERIES: { week: number; fitness: number; fatigue: number; form: number }[] = [
  { week: 1, fitness: 2.0, fatigue: 3.4, form: -1.4 },
  { week: 2, fitness: 4.0, fatigue: 5.6, form: -1.6 },
  { week: 3, fitness: 5.9, fatigue: 7.0, form: -1.1 },
  { week: 4, fitness: 7.6, fatigue: 8.3, form: -0.7 },
  { week: 5, fitness: 9.0, fatigue: 9.5, form: -0.5 },
];

/** Form as a whole percentage of fitness, the way the app's headline shows it. */
export function formPercent(point: { fitness: number; form: number }): number {
  return Math.round((point.form / point.fitness) * 100);
}

export const PROGRESSION: { muscle: string; from: number; to: number | null; note?: string }[] = [
  { muscle: "Chest", from: 16, to: 18 },
  { muscle: "Quads", from: 14, to: null, note: "hold, recovery low" },
];
