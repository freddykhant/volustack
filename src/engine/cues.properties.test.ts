import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CUE_PHASE_CARB_FACTOR, CUE_CARBS_BETWEEN_G_PER_KG, CUE_CARBS_BEFORE_G_PER_KG, CUE_PROTEIN_G_PER_KG, CUE_MAX_PER_DAY } from "./constants";
import { deriveCues, rankCues, type CueDayInput } from "./cues";

const daypart = fc.constantFrom("AM" as const, "PM" as const, null);
const lift = (id: string) =>
  fc.record({
    id: fc.constant(id),
    label: fc.constantFrom("Legs", "Upper A", "Push"),
    daypart,
    footprint: fc.record({ QUADS: fc.nat(10), HAMSTRINGS: fc.nat(8), GLUTES: fc.nat(6), CHEST: fc.nat(10) }),
  });
const activity = (id: string) =>
  fc.record({
    id: fc.constant(id),
    kind: fc.constantFrom("RUN" as const, "RIDE" as const, "SWIM" as const, "SPORT" as const, "OTHER" as const),
    intensity: fc.constantFrom("EASY" as const, "MODERATE" as const, "HARD" as const),
    daypart,
    durationMin: fc.option(fc.integer({ min: 5, max: 600 }), { nil: null }),
  });
const input: fc.Arbitrary<CueDayInput> = fc.record({
  date: fc.constant("2026-10-20"),
  lifts: fc.tuple(lift("L1"), lift("L2")).chain(([a, b]) => fc.constantFrom([], [a], [a, b])),
  activities: fc.tuple(activity("A1"), activity("A2")).chain(([a, b]) => fc.constantFrom([], [a], [a, b])),
  previous: fc.record({
    lifts: fc.tuple(lift("P1")).chain(([a]) => fc.constantFrom([], [a])),
    activities: fc.tuple(activity("PA1")).chain(([a]) => fc.constantFrom([], [a])),
  }),
  weightKg: fc.option(fc.double({ min: 20, max: 300, noNaN: true }), { nil: null }),
  phase: fc.constantFrom("CUT" as const, "MAINTAIN" as const, "BULK" as const),
});

const within = (r: readonly [number, number] | null, perKg: readonly [number, number], w: number | null, f: number) => {
  if (r === null) return true;
  if (w === null) return false;
  return r[0] >= perKg[0] * w * f - 2.5 && r[0] <= perKg[1] * w * f + 2.5 && r[1] >= r[0] + 5 && r[1] <= perKg[1] * w * f + 5;
};

describe("cue properties", () => {
  it("every number is inside its g/kg bounds, and every cue names only what the input holds", () => {
    fc.assert(
      fc.property(input, (d) => {
        const known = new Set([...d.lifts, ...d.activities, ...d.previous.lifts, ...d.previous.activities].map((x) => x.id));
        const f = CUE_PHASE_CARB_FACTOR[d.phase];
        for (const c of deriveCues(d)) {
          if (c.kind === "fuel_between") {
            expect(within(c.carbsG, CUE_CARBS_BETWEEN_G_PER_KG, d.weightKg, f)).toBe(true);
            expect(known.has(c.first.id) && known.has(c.second.id)).toBe(true);
          } else if (c.kind === "recovery_overlap") {
            expect(within(c.proteinG, CUE_PROTEIN_G_PER_KG, d.weightKg, 1)).toBe(true);
            expect(known.has(c.yesterday.id) && known.has(c.today.id)).toBe(true);
          } else {
            expect(within(c.carbsG, CUE_CARBS_BEFORE_G_PER_KG, d.weightKg, f)).toBe(true);
            expect(d.lifts.some((l) => l.id === c.lift.id)).toBe(true);
          }
        }
        expect(rankCues(deriveCues(d)).length).toBeLessThanOrEqual(CUE_MAX_PER_DAY);
      }),
    );
  });
});
