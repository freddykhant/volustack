// src/engine/redistribute.test.ts
import { describe, expect, it } from "vitest";
import { EXERCISE_LIBRARY } from "~/domain/exercise-library";
import { redistributeWeek } from "./redistribute";
import { sessionMinutes } from "./time";
import type { AdaptationContext, ResolvedMuscleTarget, WeekPlan } from "./types";

const targets: ResolvedMuscleTarget[] = [
  { muscle: "CHEST", weeklySetTarget: 12, priority: 1, mev: 8, mav: 14, effectiveMrv: 22 },
  { muscle: "BACK", weeklySetTarget: 12, priority: 0, mev: 10, mav: 16, effectiveMrv: 25 },
];

function ctx(over: Partial<AdaptationContext> = {}): AdaptationContext {
  return { targets, splitType: "UPPER_LOWER", daysPerWeek: 4, sessionLengthCapMin: 60, blockLengthWeeks: 6, deloadWeekIndex: 6, isBeginner: false, library: EXERCISE_LIBRARY, ...over };
}

// Week with two upper sessions; upper-b is missed (6 chest sets to redistribute).
function week(): WeekPlan {
  const px = (exerciseName: string, sets: number) => ({ exerciseName, sets, repRangeLow: 6, repRangeHigh: 10, targetRir: 2 });
  return {
    index: 2,
    isDeload: false,
    sessions: [
      { slotId: "upper-a", label: "Upper A", prescriptions: [px("Barbell Bench Press", 6), px("Barbell Row", 6)], estimatedMinutes: sessionMinutes([{ sets: 6 }, { sets: 6 }]) },
      { slotId: "upper-b", label: "Upper B", prescriptions: [px("Barbell Bench Press", 6)], estimatedMinutes: sessionMinutes([{ sets: 6 }]) },
    ],
    muscleVolume: { CHEST: 12, BACK: 6 } as WeekPlan["muscleVolume"],
  };
}

describe("redistributeWeek", () => {
  it("returns candidates that are all complete valid plans within the cap", () => {
    const cands = redistributeWeek(week(), ["upper-b"], ctx());
    expect(cands.length).toBeGreaterThanOrEqual(1);
    for (const c of cands) {
      for (const s of c.week.sessions) {
        expect(sessionMinutes(s.prescriptions)).toBeLessThanOrEqual(60);
      }
      // the missed session is gone from every candidate
      expect(c.week.sessions.some((s) => s.slotId === "upper-b")).toBe(false);
    }
  });

  it("MAKE_UP recovers ≥ LET_GO recovered volume", () => {
    const cands = redistributeWeek(week(), ["upper-b"], ctx());
    const makeUp = cands.find((c) => c.kind === "MAKE_UP");
    const letGo = cands.find((c) => c.kind === "LET_GO");
    expect(letGo).toBeDefined();
    expect(letGo!.tradeoff.recovered).toBe(0);
    if (makeUp) expect(makeUp.tradeoff.recovered).toBeGreaterThanOrEqual(letGo!.tradeoff.recovered);
  });

  it("every recovered set emits a redistributed fact; dropped sets emit dropped_volume", () => {
    const cands = redistributeWeek(week(), ["upper-b"], ctx());
    const makeUp = cands.find((c) => c.kind === "MAKE_UP");
    if (makeUp && makeUp.tradeoff.recovered > 0) {
      expect(makeUp.facts.some((f) => f.kind === "redistributed")).toBe(true);
    }
    const letGo = cands.find((c) => c.kind === "LET_GO")!;
    expect(letGo.facts.some((f) => f.kind === "dropped_volume")).toBe(true);
  });

  it("returns nothing when no session was missed", () => {
    expect(redistributeWeek(week(), [], ctx())).toEqual([]);
  });

  it("marks exactly one candidate recommended", () => {
    const cands = redistributeWeek(week(), ["upper-b"], ctx());
    expect(cands.filter((c) => c.recommended).length).toBe(1);
  });
});
