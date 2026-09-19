import { describe, expect, it } from "vitest";
import type { RedistributionCandidate, WeekPlan } from "~/engine";
import { toRescheduleOptionViews } from "./reschedule";

const originalWeek = {
  index: 2, isDeload: false,
  muscleVolume: {} as never,
  sessions: [
    { slotId: "sA", label: "Upper A", estimatedMinutes: 50, prescriptions: [{ exerciseName: "Bench", sets: 3, repRangeLow: 6, repRangeHigh: 10, targetRir: 2 }] },
    { slotId: "sB", label: "Lower A", estimatedMinutes: 50, prescriptions: [{ exerciseName: "Squat", sets: 4, repRangeLow: 6, repRangeHigh: 10, targetRir: 2 }] },
  ],
} as unknown as WeekPlan;

function candidate(over: Partial<RedistributionCandidate>): RedistributionCandidate {
  return {
    kind: "MAKE_UP",
    recommended: false,
    tradeoff: { recovered: 3, dropped: 0 },
    facts: [],
    week: {
      index: 2, isDeload: false, muscleVolume: {} as never,
      sessions: [
        { slotId: "sA", label: "Upper A", estimatedMinutes: 74, prescriptions: [{ exerciseName: "Bench", sets: 6, repRangeLow: 6, repRangeHigh: 10, targetRir: 2 }] },
        { slotId: "sB", label: "Lower A", estimatedMinutes: 50, prescriptions: [{ exerciseName: "Squat", sets: 4, repRangeLow: 6, repRangeHigh: 10, targetRir: 2 }] },
      ],
    },
    ...over,
  };
}

describe("toRescheduleOptionViews", () => {
  it("maps kind/recovered/dropped/recommended and per-session added sets", () => {
    const views = toRescheduleOptionViews([candidate({ recommended: true })], originalWeek);
    expect(views).toHaveLength(1);
    const v = views[0]!;
    expect(v.kind).toBe("MAKE_UP");
    expect(v.recommended).toBe(true);
    expect(v.recoveredSets).toBe(3);
    expect(v.droppedSets).toBe(0);
    // sA went 3 → 6 sets (+3); sB unchanged (filtered out)
    expect(v.perSession).toEqual([{ slotId: "sA", label: "Upper A", addedSets: 3 }]);
  });

  it("summarises LET_GO as a drop", () => {
    const letGo = candidate({ kind: "LET_GO", tradeoff: { recovered: 0, dropped: 4 }, week: originalWeek });
    const v = toRescheduleOptionViews([letGo], originalWeek)[0]!;
    expect(v.kind).toBe("LET_GO");
    expect(v.perSession).toEqual([]);
    expect(v.summary.toLowerCase()).toContain("drop");
  });
});
