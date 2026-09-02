// src/engine/deload.test.ts
import { describe, expect, it } from "vitest";
import { evaluateDeload } from "./deload";
import type { AdaptationContext, MesocyclePlan, ResolvedMuscleTarget, WeekOutcome } from "./types";

const targets: ResolvedMuscleTarget[] = [
  { muscle: "CHEST", weeklySetTarget: 20, priority: 1, mev: 8, mav: 14, effectiveMrv: 20 },
  { muscle: "BACK", weeklySetTarget: 22, priority: 1, mev: 10, mav: 16, effectiveMrv: 22 },
  { muscle: "QUADS", weeklySetTarget: 18, priority: 0, mev: 8, mav: 14, effectiveMrv: 18 },
];

function ctx(over: Partial<AdaptationContext> = {}): AdaptationContext {
  return { targets, splitType: "UPPER_LOWER", daysPerWeek: 4, sessionLengthCapMin: 60, blockLengthWeeks: 6, deloadWeekIndex: 6, isBeginner: false, library: [], ...over };
}
const plan: MesocyclePlan = { splitType: "UPPER_LOWER", blockLengthWeeks: 6, deloadWeekIndex: 6, weeks: [], facts: [] };

function outcome(weekIndex: number, atMrv: string[], recovery: number): WeekOutcome {
  const muscleVolume = { CHEST: 10, BACK: 10, QUADS: 10 } as WeekOutcome["muscleVolume"];
  const eff: Record<string, number> = { CHEST: 20, BACK: 22, QUADS: 18 };
  for (const m of atMrv) muscleVolume[m as keyof typeof muscleVolume] = eff[m]!;
  return { weekIndex, muscleVolume, feedback: { weekIndex, muscles: atMrv.map((m) => ({ muscle: m as "CHEST", recovery })) } };
}

describe("evaluateDeload", () => {
  it("returns scheduled_next when the next week is the deload week", () => {
    const r = evaluateDeload(plan, [outcome(5, [], 3)], ctx());
    expect(r.decision).toBe("scheduled_next");
    expect(r.facts.some((f) => f.kind === "deload_scheduled" && f.atWeek === 6)).toBe(true);
  });

  it("recommends early deload after 2 consecutive fatigued weeks", () => {
    const r = evaluateDeload(plan, [outcome(2, ["CHEST", "BACK"], 1), outcome(3, ["CHEST", "BACK"], 0)], ctx());
    expect(r.decision).toBe("recommend_early");
    expect(r.facts.some((f) => f.kind === "deload_recommended")).toBe(true);
  });

  it("does not recommend early when only one week is fatigued", () => {
    const r = evaluateDeload(plan, [outcome(2, [], 3), outcome(3, ["CHEST", "BACK"], 0)], ctx());
    expect(r.decision).toBe("none");
  });

  it("beginners get scheduled-only (no reactive deload)", () => {
    const r = evaluateDeload(plan, [outcome(2, ["CHEST", "BACK"], 1), outcome(3, ["CHEST", "BACK"], 0)], ctx({ isBeginner: true }));
    expect(r.decision).toBe("none");
  });
});
