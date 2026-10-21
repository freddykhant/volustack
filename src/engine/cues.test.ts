import { describe, expect, it } from "vitest";
import { cueId, deriveCues, gramRange, lowerSets, rankCues, type CueActivity, type CueDayInput, type CueLift } from "./cues";

const legs = (over: Partial<CueLift> = {}): CueLift => ({
  id: "L",
  label: "Legs",
  daypart: "PM",
  footprint: { QUADS: 6, HAMSTRINGS: 4, GLUTES: 2, CALVES: 4 },
  ...over,
});
const upper = (over: Partial<CueLift> = {}): CueLift => ({
  id: "U",
  label: "Upper A",
  daypart: "AM",
  footprint: { CHEST: 8, BACK: 8 },
  ...over,
});
const run = (over: Partial<CueActivity> = {}): CueActivity => ({
  id: "R",
  kind: "RUN",
  intensity: "HARD",
  daypart: "AM",
  durationMin: null,
  ...over,
});
const day = (over: Partial<CueDayInput> = {}): CueDayInput => ({
  date: "2026-10-20",
  lifts: [],
  activities: [],
  previous: { lifts: [], activities: [] },
  weightKg: 80,
  phase: "MAINTAIN",
  ...over,
});
const kinds = (input: CueDayInput) => deriveCues(input).map((f) => f.kind);

describe("lowerSets", () => {
  it("counts quads, hamstrings and glutes, not calves", () => {
    expect(lowerSets({ QUADS: 6, HAMSTRINGS: 4, GLUTES: 2, CALVES: 4 })).toBe(12);
    expect(lowerSets({ CHEST: 10 })).toBe(0);
  });
});

describe("gramRange", () => {
  it("multiplies by weight and factor, rounds to 5 g", () => {
    expect(gramRange([1.0, 1.2], 80, 1)).toEqual([80, 95]);
    expect(gramRange([0.3, 0.4], 80, 1)).toEqual([25, 30]);
    expect(gramRange([1.0, 1.2], 80, 0.8)).toEqual([65, 75]);
  });
  it("keeps the high end at least 5 g above the low end", () => {
    expect(gramRange([0.3, 0.31], 40, 1)).toEqual([10, 15]);
  });
  it("gives no number without a plausible bodyweight", () => {
    expect(gramRange([1, 1.2], null, 1)).toBeNull();
    expect(gramRange([1, 1.2], 29.9, 1)).toBeNull();
    expect(gramRange([1, 1.2], 250.1, 1)).toBeNull();
    expect(gramRange([1, 1.2], Number.NaN, 1)).toBeNull();
    expect(gramRange([1, 1.2], 30, 1)).not.toBeNull();
    expect(gramRange([1, 1.2], 250, 1)).not.toBeNull();
  });
});

describe("fuel_between", () => {
  it("fires for a hard AM run and PM legs, in the known order", () => {
    const [f] = deriveCues(day({ lifts: [legs()], activities: [run()] }));
    expect(f).toMatchObject({
      kind: "fuel_between",
      order: "known",
      first: { type: "activity", id: "R" },
      second: { type: "lift", id: "L" },
      carbsG: [80, 95],
    });
  });
  it("puts the lift first when it is the morning one", () => {
    const [f] = deriveCues(day({ lifts: [legs({ daypart: "AM" })], activities: [run({ daypart: "PM" })] }));
    expect(f).toMatchObject({ first: { id: "L" }, second: { id: "R" }, order: "known" });
  });
  it("says the order is unknown when either side has no daypart or both share one", () => {
    expect(deriveCues(day({ lifts: [legs({ daypart: null })], activities: [run()] }))[0]).toMatchObject({ order: "unknown" });
    expect(deriveCues(day({ lifts: [legs({ daypart: "AM" })], activities: [run()] }))[0]).toMatchObject({ order: "unknown" });
  });
  it("fires for two lifts on one day", () => {
    const [f] = deriveCues(day({ lifts: [upper(), legs()] }));
    expect(f).toMatchObject({ kind: "fuel_between", first: { id: "U" }, second: { id: "L" }, order: "known" });
  });
  it("needs a demanding activity: easy under 60 min is not, easy at 60 is", () => {
    expect(kinds(day({ lifts: [upper()], activities: [run({ intensity: "EASY", durationMin: 59 })] }))).toEqual([]);
    expect(kinds(day({ lifts: [upper()], activities: [run({ intensity: "EASY", durationMin: null })] }))).toEqual([]);
    expect(kinds(day({ lifts: [upper()], activities: [run({ intensity: "EASY", durationMin: 60 })] }))).toEqual(["fuel_between"]);
    expect(kinds(day({ lifts: [upper()], activities: [run({ intensity: "MODERATE" })] }))).toEqual(["fuel_between"]);
  });
  it("scales carbs with phase and drops the number without a bodyweight", () => {
    expect(deriveCues(day({ lifts: [legs()], activities: [run()], phase: "BULK" }))[0]).toMatchObject({ carbsG: [95, 115] });
    expect(deriveCues(day({ lifts: [legs()], activities: [run()], weightKg: null }))[0]).toMatchObject({ carbsG: null });
  });
  it("suppresses heavy_lower for a lift it already names", () => {
    expect(kinds(day({ lifts: [legs()], activities: [run()] }))).toEqual(["fuel_between"]);
  });
  it("says nothing about an activity alone", () => {
    expect(kinds(day({ activities: [run()] }))).toEqual([]);
  });
});

describe("heavy_lower", () => {
  const withLower = (n: number) => legs({ footprint: { QUADS: n } });
  it("fires at 10 lower-body sets, not 9", () => {
    expect(kinds(day({ lifts: [withLower(9)] }))).toEqual([]);
    expect(kinds(day({ lifts: [withLower(10)] }))).toEqual(["heavy_lower"]);
    expect(deriveCues(day({ lifts: [withLower(11)] }))[0]).toMatchObject({ lowerSets: 11, carbsG: [80, 120], mealHoursBefore: [2, 3] });
  });
});

describe("recovery_overlap", () => {
  it("fires for heavy legs today after a leg-loading activity yesterday", () => {
    const [f] = deriveCues(day({ lifts: [legs()], previous: { lifts: [], activities: [run()] } }));
    expect(f).toMatchObject({ kind: "recovery_overlap", yesterday: { id: "R" }, today: { id: "L" }, proteinG: [25, 30] });
  });
  it("fires for a leg-loading activity today after heavy legs yesterday", () => {
    const [f] = deriveCues(day({ activities: [run({ kind: "RIDE" })], previous: { lifts: [legs()], activities: [] } }));
    expect(f).toMatchObject({ kind: "recovery_overlap", yesterday: { id: "L" }, today: { id: "R" } });
  });
  it("does not treat swims or other activities as leg-loading", () => {
    for (const kind of ["SWIM", "OTHER"] as const) {
      expect(kinds(day({ lifts: [legs({ footprint: { QUADS: 4 } })], previous: { lifts: [], activities: [run({ kind })] } }))).toEqual([]);
    }
  });
  it("protein does not scale with phase", () => {
    const f = deriveCues(day({ lifts: [legs()], phase: "CUT", previous: { lifts: [], activities: [run()] } }));
    expect(f.find((x) => x.kind === "recovery_overlap")).toMatchObject({ proteinG: [25, 30] });
  });
});

describe("cueId and rankCues", () => {
  it("builds a stable id from the date, kind and sorted ids", () => {
    const [f] = deriveCues(day({ lifts: [legs()], activities: [run()] }));
    expect(cueId(f!)).toBe("2026-10-20:fuel_between:L+R");
  });
  it("orders fuel_between, recovery_overlap, heavy_lower and keeps two", () => {
    const facts = deriveCues(
      day({
        lifts: [legs({ id: "L1", daypart: "PM" }), legs({ id: "L2", label: "Legs B", daypart: null })],
        activities: [run()],
        previous: { lifts: [], activities: [run({ id: "R0" })] },
      }),
    );
    const ranked = rankCues(facts);
    expect(ranked).toHaveLength(2);
    expect(ranked.map((f) => f.kind)).toEqual(["fuel_between", "fuel_between"]);
    expect(rankCues([...facts].reverse())).toEqual(ranked);
  });
});
