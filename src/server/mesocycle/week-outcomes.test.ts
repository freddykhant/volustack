import { describe, expect, it } from "vitest";
import { weekOutcomesFromBlock, type WeekForOutcome } from "./week-outcomes";

function week(index: number, over: Partial<WeekForOutcome> = {}): WeekForOutcome {
  return {
    index,
    muscleVolumes: [{ muscle: "CHEST", plannedSets: 12 }],
    checkIns: [],
    ...over,
  };
}

describe("weekOutcomesFromBlock", () => {
  it("builds a full muscleVolume map (0 for muscles with no row)", () => {
    const [out] = weekOutcomesFromBlock([week(1)]);
    expect(out!.muscleVolume.CHEST).toBe(12);
    expect(out!.muscleVolume.BICEPS).toBe(0);
  });

  it("maps the WEEK check-in's feedback, nulls → undefined", () => {
    const w = week(1, {
      checkIns: [
        {
          scope: "WEEK",
          muscleFeedback: [{ muscle: "CHEST", recovery: 1, performance: null, jointStress: 0 }],
        },
      ],
    });
    const [out] = weekOutcomesFromBlock([w]);
    expect(out!.feedback).not.toBeNull();
    expect(out!.feedback!.muscles).toEqual([
      { muscle: "CHEST", recovery: 1, performance: undefined, joint: 0 },
    ]);
  });

  it("feedback is null when the week has no check-in", () => {
    const [out] = weekOutcomesFromBlock([week(1)]);
    expect(out!.feedback).toBeNull();
  });

  it("orders outcomes by week index", () => {
    const out = weekOutcomesFromBlock([week(2), week(1)]);
    expect(out.map((o) => o.weekIndex)).toEqual([1, 2]);
  });
});
