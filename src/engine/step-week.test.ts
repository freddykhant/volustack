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

  it("feedback that hits none of rules 1–4 falls through to on_track (rule 5) and holds", () => {
    // recovery 2 fails rule 2 (rec <= RECOVERY_LOW=1); performance 1 fails
    // rules 3/4 (perf >= SCORE_GOOD=2). Neither joint-stress nor
    // under-recovered nor responding-well/approaching-mrv applies.
    const r = stepWeek(
      planWith({ 1: 12, 2: 14 }),
      1,
      { weekIndex: 1, muscles: [{ muscle: "CHEST", recovery: 2, performance: 1 }] },
      ctx,
    );
    const a = r.adjustments.find((x) => x.muscle === "CHEST")!;
    expect(a.cause).toBe("on_track");
    expect(a.adjustedSets).toBe(a.plannedSets); // hold at plannedNext (14)
  });

  it("checkInValue is high when the upcoming ramp crosses MAV, even without near-MRV or fatigue feedback", () => {
    // current 12 < mav 14, plannedNext 14 >= mav 14 → crossesMav.
    // plannedNext 14 is nowhere near effMRV 22 (nearMrv false), and there's
    // no feedback at all (flaggedNow false) — crossesMav alone must drive it.
    const r = stepWeek(planWith({ 1: 12, 2: 14 }), 1, null, ctx);
    expect(r.checkInValue).toBe("high");
  });

  it("checkInValue is high from flaggedNow even when the upcoming week is the deload (Fix 1)", () => {
    // Before the fix, flaggedNow was gated inside `upcoming && !upcomingIsDeload`,
    // so severe joint pain reported going into a deload week silently produced
    // checkInValue "low" — dropping a safety signal. Week 6 is the deload
    // (see planWith), so weekIndex 5 → appliesTo 6, upcomingIsDeload === true.
    const r = stepWeek(
      planWith({ 5: 14, 6: 7 }),
      5,
      { weekIndex: 5, muscles: [{ muscle: "CHEST", joint: 3 }] },
      ctx,
    );
    expect(r.checkInValue).toBe("high");
  });

  it("clamps a plan carried over at a volume above the current effective MRV (genuine ceiling truncation)", () => {
    // plannedNext (24) exceeds effectiveMrv (22), simulating a plan carried
    // into a lower-MRV phase. Good feedback would otherwise hold/step up,
    // but the MRV ceiling clamp must truncate it down to effectiveMrv.
    const r = stepWeek(
      planWith({ 1: 23, 2: 24 }),
      1,
      { weekIndex: 1, muscles: [{ muscle: "CHEST", recovery: 3, performance: 3 }] },
      ctx,
    );
    const a = r.adjustments.find((x) => x.muscle === "CHEST")!;
    expect(a.adjustedSets).toBe(22); // clamped to effectiveMrv
    expect(a.adjustedSets).toBeLessThan(a.plannedSets); // proves the ceiling clamp actually fired
  });

  it("adjusts each muscle independently based on its own feedback (multi-muscle)", () => {
    const multiCtx = ctxWith([target("CHEST"), target("BACK")]);
    const plan: MesocyclePlan = {
      splitType: "UPPER_LOWER",
      blockLengthWeeks: 6,
      deloadWeekIndex: 6,
      weeks: [
        { index: 1, isDeload: false, sessions: [], muscleVolume: { CHEST: 12, BACK: 12 } as MesocyclePlan["weeks"][number]["muscleVolume"] },
        { index: 2, isDeload: false, sessions: [], muscleVolume: { CHEST: 14, BACK: 14 } as MesocyclePlan["weeks"][number]["muscleVolume"] },
      ],
      facts: [],
    };
    const r = stepWeek(
      plan,
      1,
      {
        weekIndex: 1,
        muscles: [
          { muscle: "CHEST", joint: 3 },
          { muscle: "BACK", recovery: 3, performance: 3 },
        ],
      },
      multiCtx,
    );
    const chest = r.adjustments.find((x) => x.muscle === "CHEST")!;
    const back = r.adjustments.find((x) => x.muscle === "BACK")!;

    expect(chest.cause).toBe("joint_stress");
    expect(chest.delta).toBe(-2);
    expect(chest.swapCandidate).toBe(true);

    expect(back.cause).toBe("responding_well");
    expect(back.delta).toBe(1);
    expect(back.swapCandidate).toBe(false);

    expect(r.facts.some((f) => f.kind === "stepped" && f.muscle === "CHEST" && f.cause === "joint_stress")).toBe(true);
    expect(r.facts.some((f) => f.kind === "stepped" && f.muscle === "BACK" && f.cause === "responding_well")).toBe(true);
  });
});
