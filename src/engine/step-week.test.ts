// src/engine/step-week.test.ts
import { describe, expect, it } from "vitest";
import { stepWeek } from "./step-week";
import type { AdaptationContext, MesocyclePlan, ResolvedMuscleTarget } from "./types";

function target(muscle: string, over: Partial<ResolvedMuscleTarget> = {}): ResolvedMuscleTarget {
  return { muscle: muscle as ResolvedMuscleTarget["muscle"], weeklySetTarget: 16, priority: 1, mev: 8, mav: 14, effectiveMrv: 22, ...over };
}

function ctxWith(targets: ResolvedMuscleTarget[], over: Partial<AdaptationContext> = {}): AdaptationContext {
  return { targets, splitType: "UPPER_LOWER", daysPerWeek: 4, sessionLengthCapMin: 60, blockLengthWeeks: 6, deloadWeekIndex: 6, isBeginner: false, library: [], ...over };
}

// A minimal plan: week 1 = 12 chest, week 2 (upcoming) planned = 14.
function planWith(vols: Record<number, number>, muscle = "CHEST"): MesocyclePlan {
  const weeks = Object.entries(vols).map(([idx, v]) => ({
    index: Number(idx),
    isDeload: Number(idx) === 6,
    sessions: [],
    muscleVolume: { [muscle]: v } as MesocyclePlan["weeks"][number]["muscleVolume"],
  }));
  return { splitType: "UPPER_LOWER", blockLengthWeeks: 6, deloadWeekIndex: 6, weeks, facts: [] };
}

describe("stepWeek rule table", () => {
  const ctx = ctxWith([target("CHEST")]);

  it("joint ≥ 2 backs off 2 sets and flags a swap", () => {
    const plan = planWith({ 1: 12, 2: 14 });
    const r = stepWeek(plan, 1, { weekIndex: 1, muscles: [{ muscle: "CHEST", joint: 3 }] }, ctx);
    const a = r.adjustments.find((x) => x.muscle === "CHEST")!;
    expect(a.adjustedSets).toBe(12); // 14 - 2
    expect(a.cause).toBe("joint_stress");
    expect(a.swapCandidate).toBe(true);
    expect(r.facts.some((f) => f.kind === "swap_suggested" && f.muscle === "CHEST")).toBe(true);
    expect(r.facts.some((f) => f.kind === "stepped" && f.muscle === "CHEST" && f.cause === "joint_stress")).toBe(true);
  });

  it("recovery ≤ 1 drops 1 set, or 2 when at/over MAV", () => {
    const below = stepWeek(planWith({ 1: 12, 2: 13 }), 1, { weekIndex: 1, muscles: [{ muscle: "CHEST", recovery: 0 }] }, ctx);
    expect(below.adjustments[0]!.adjustedSets).toBe(12); // 13 - 1
    const atMav = stepWeek(planWith({ 1: 14, 2: 15 }), 1, { weekIndex: 1, muscles: [{ muscle: "CHEST", recovery: 1 }] }, ctx);
    expect(atMav.adjustments[0]!.adjustedSets).toBe(13); // 15 - 2 (planned 15 ≥ MAV 14)
    expect(atMav.adjustments[0]!.cause).toBe("under_recovered");
  });

  it("responding well (rec≥2, perf≥2, below MRV-1) adds 1 set", () => {
    const r = stepWeek(planWith({ 1: 12, 2: 14 }), 1, { weekIndex: 1, muscles: [{ muscle: "CHEST", recovery: 3, performance: 3 }] }, ctx);
    expect(r.adjustments[0]!.adjustedSets).toBe(15); // 14 + 1
    expect(r.adjustments[0]!.cause).toBe("responding_well");
  });

  it("responding well near MRV holds at planned", () => {
    const r = stepWeek(planWith({ 1: 20, 2: 21 }), 1, { weekIndex: 1, muscles: [{ muscle: "CHEST", recovery: 3, performance: 3 }] }, ctx);
    expect(r.adjustments[0]!.adjustedSets).toBe(21); // planned 21 > MRV(22)-2 → hold
    expect(r.adjustments[0]!.cause).toBe("approaching_mrv");
  });

  it("no feedback → default progression, no change", () => {
    const r = stepWeek(planWith({ 1: 12, 2: 14 }), 1, null, ctx);
    expect(r.adjustments[0]!.adjustedSets).toBe(14);
    expect(r.adjustments[0]!.cause).toBe("default_progression");
  });

  it("clamps never exceed effective MRV nor drop below MEV", () => {
    const r = stepWeek(planWith({ 1: 21, 2: 22 }), 1, { weekIndex: 1, muscles: [{ muscle: "CHEST", recovery: 3, performance: 3 }] }, ctx);
    expect(r.adjustments[0]!.adjustedSets).toBeLessThanOrEqual(22); // effMRV
    const low = stepWeek(planWith({ 1: 9, 2: 9 }), 1, { weekIndex: 1, muscles: [{ muscle: "CHEST", joint: 3 }] }, ctx);
    expect(low.adjustments[0]!.adjustedSets).toBeGreaterThanOrEqual(8); // MEV floor
  });

  it("checkInValue is high when the ramp approaches MRV", () => {
    const high = stepWeek(planWith({ 1: 19, 2: 21 }), 1, null, ctx);
    expect(high.checkInValue).toBe("high"); // 21 ≥ 22 - 2
    const low = stepWeek(planWith({ 1: 10, 2: 11 }), 1, null, ctx);
    expect(low.checkInValue).toBe("low");
  });
});
