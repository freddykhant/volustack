import { describe, expect, it } from "vitest";
import type { CueFact } from "~/engine";
import { CUE_FOOTER, toCueView } from "./cues";

const run = { type: "activity", id: "R", kind: "RUN", intensity: "HARD" } as const;
const legs = { type: "lift", id: "L", label: "Legs" } as const;
const swim = { type: "activity", id: "S", kind: "SWIM", intensity: "EASY" } as const;

const fuel = (over: Partial<Extract<CueFact, { kind: "fuel_between" }>> = {}): CueFact => ({
  kind: "fuel_between", date: "2026-10-20", first: run, second: legs, order: "known", carbsG: [80, 95], ...over,
});
const overlap = (over: Partial<Extract<CueFact, { kind: "recovery_overlap" }>> = {}): CueFact => ({
  kind: "recovery_overlap", date: "2026-10-20", yesterday: run, today: legs, proteinG: [25, 30], ...over,
});
const heavy = (over: Partial<Extract<CueFact, { kind: "heavy_lower" }>> = {}): CueFact => ({
  kind: "heavy_lower", date: "2026-10-20", lift: legs, lowerSets: 14, carbsG: [80, 120], mealHoursBefore: [2, 3], ...over,
});

describe("toCueView", () => {
  it("names a known order as 'X, then Y' and gives the range", () => {
    const v = toCueView(fuel(), "today");
    expect(v.title).toBe("Hard run, then Legs");
    expect(v.line).toMatch(/80–95 g of carbs/);
    expect(v.hasNumber).toBe(true);
    expect(v.id).toBe("2026-10-20:fuel_between:L+R");
  });
  it("says 'on the same day' when the order is unknown", () => {
    expect(toCueView(fuel({ order: "unknown" }), "today").title).toBe("Hard run and Legs on the same day");
  });
  it("uses plain words with no number", () => {
    const v = toCueView(fuel({ carbsG: null }), "today");
    expect(v.line).not.toMatch(/\d/);
    expect(v.line.toLowerCase()).toContain("carb");
    expect(v.hasNumber).toBe(false);
  });
  it("words the previous day relative to the cue's day", () => {
    expect(toCueView(overlap(), "today").title).toBe("Hard run yesterday, Legs today");
    expect(toCueView(overlap(), "tomorrow").title).toBe("Hard run today, Legs tomorrow");
  });
  it("describes a long easy activity as such", () => {
    expect(toCueView(fuel({ first: { ...run, intensity: "EASY" } }), "today").title).toBe("Long easy run, then Legs");
  });
  it("gives protein for an overlap and carbs with timing for a heavy lower day", () => {
    expect(toCueView(overlap(), "today").line).toMatch(/25–30 g of protein/);
    const h = toCueView(heavy(), "today");
    expect(h.title).toBe("Big lower-body day");
    expect(h.line).toMatch(/14 lower-body sets/);
    expect(h.line).toMatch(/80–120 g of carbs/);
    expect(h.line).toMatch(/2–3 hours/);
  });
  it("picks the same variant for the same cue every time", () => {
    expect(toCueView(fuel(), "today").line).toBe(toCueView(fuel(), "today").line);
  });
  it("never leaves undefined, NaN or a hyphen range in any line", () => {
    const facts = [fuel(), fuel({ carbsG: null }), fuel({ order: "unknown", second: swim }), overlap(), overlap({ proteinG: null }), heavy(), heavy({ carbsG: null })];
    for (const f of facts)
      for (const when of ["today", "tomorrow"] as const) {
        const v = toCueView(f, when);
        expect(`${v.title} ${v.line}`).not.toMatch(/undefined|NaN|\d-\d|glycogen|macros/);
      }
  });
  it("keeps the footer verbatim", () => {
    expect(CUE_FOOTER).toBe("Based on your bodyweight and phase. A guide, not a meal plan.");
  });
});
