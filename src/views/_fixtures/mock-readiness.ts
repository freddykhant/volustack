import type { ReadinessPoint, ReadinessView } from "~/views/types";

const point = (weekIndex: number, fitness: number, fatigue: number): ReadinessPoint => ({
  weekIndex,
  fitness,
  fatigue,
  form: fitness - fatigue,
});

/** Faked readiness arc aligned to the 6-week mock block (current week 3, deload
 * week 6): fitness climbs, fatigue accumulates, form slides into overreaching by
 * week 5, then the deload rebounds it to fresh. Phase 2 replaces this with real
 * biodata (Garmin / Strava / Bevel). */
export const mockReadiness: ReadinessView = {
  currentWeekIndex: 3,
  series: [
    point(1, 32, 28),
    point(2, 38, 42),
    point(3, 44, 56),
    point(4, 49, 66),
    point(5, 53, 80),
    point(6, 51, 30),
  ],
};
