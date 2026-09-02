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

// Week where the missed session (upper-b) mixes a priority>0 muscle (CHEST, via
// Barbell Bench Press) with a priority-0 muscle (BACK, via Barbell Row). MAKE_UP
// recovers both into upper-a (which starts empty, so there's ample cap headroom);
// PARTIAL only recovers the CHEST sets, leaving the BACK sets dropped — so its
// recovered count is strictly between 0 and MAKE_UP's.
function mixedPriorityWeek(): WeekPlan {
  const px = (exerciseName: string, sets: number) => ({ exerciseName, sets, repRangeLow: 6, repRangeHigh: 10, targetRir: 2 });
  return {
    index: 2,
    isDeload: false,
    sessions: [
      { slotId: "upper-a", label: "Upper A", prescriptions: [], estimatedMinutes: sessionMinutes([]) },
      {
        slotId: "upper-b",
        label: "Upper B",
        prescriptions: [px("Barbell Bench Press", 6), px("Barbell Row", 6)],
        estimatedMinutes: sessionMinutes([{ sets: 6 }, { sets: 6 }]),
      },
    ],
    muscleVolume: { CHEST: 6, BACK: 6 } as WeekPlan["muscleVolume"],
  };
}

// Same shape as `week()` but pushed to a late-block week with CHEST volume
// already sitting within 2 sets of its effectiveMrv (22), so the recommendation
// policy should prefer LET_GO over the fallback MAKE_UP.
function lateBlockNearMrvWeek(): WeekPlan {
  const base = week();
  return { ...base, index: 5, muscleVolume: { CHEST: 22, BACK: 6 } as WeekPlan["muscleVolume"] };
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

  it("emits a PARTIAL candidate distinct from MAKE_UP when priorities diverge", () => {
    const cands = redistributeWeek(mixedPriorityWeek(), ["upper-b"], ctx());
    const makeUp = cands.find((c) => c.kind === "MAKE_UP");
    const partial = cands.find((c) => c.kind === "PARTIAL");

    expect(makeUp).toBeDefined();
    expect(partial).toBeDefined();
    // MAKE_UP recovers both the CHEST (priority>0) and BACK (priority 0) sets.
    expect(makeUp!.tradeoff.recovered).toBe(12);
    // PARTIAL only recovers the priority>0 muscle's sets, strictly less than MAKE_UP.
    expect(partial!.tradeoff.recovered).toBeGreaterThan(0);
    expect(partial!.tradeoff.recovered).toBeLessThan(makeUp!.tradeoff.recovered);
    expect(partial!.tradeoff.recovered).toBe(6);

    const upperA = partial!.week.sessions.find((s) => s.slotId === "upper-a")!;
    const bench = upperA.prescriptions.find((p) => p.exerciseName === "Barbell Bench Press");
    const row = upperA.prescriptions.find((p) => p.exerciseName === "Barbell Row");
    expect(bench?.sets).toBe(6); // priority>0 (CHEST) muscle's sets were recovered
    expect(row).toBeUndefined(); // priority-0 (BACK) muscle's sets were not recovered
  });

  it("recommends LET_GO in a late-block, near-MRV week", () => {
    const cands = redistributeWeek(lateBlockNearMrvWeek(), ["upper-b"], ctx({ blockLengthWeeks: 6 }));
    const recommended = cands.filter((c) => c.recommended);
    expect(recommended.length).toBe(1);
    expect(recommended[0]!.kind).toBe("LET_GO");
  });

  it("redistributed facts point from the missed slot to a remaining slot; recovered+dropped covers all missed sets", () => {
    const cands = redistributeWeek(week(), ["upper-b"], ctx());
    const makeUp = cands.find((c) => c.kind === "MAKE_UP")!;
    const redistributed = makeUp.facts.find((f) => f.kind === "redistributed");
    expect(redistributed).toBeDefined();
    if (redistributed?.kind === "redistributed") {
      expect(redistributed.from).toBe("upper-b");
      expect(redistributed.to).toBe("upper-a");
    }

    const totalMissedSets = week()
      .sessions.filter((s) => s.slotId === "upper-b")
      .flatMap((s) => s.prescriptions)
      .reduce((sum, p) => sum + p.sets, 0);
    expect(makeUp.tradeoff.recovered + makeUp.tradeoff.dropped).toBe(totalMissedSets);
  });
});
