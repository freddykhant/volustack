import { describe, expect, it } from "vitest";
import type { WeekForPlan } from "./reschedule-adapters";
import { mesocyclePlanFromDb } from "./mesocycle-plan-from-db";

function week(index: number, isDeload: boolean): WeekForPlan {
  return {
    // only the fields weekPlanFromDb reads; cast keeps the test focused
    index,
    isDeload,
    muscleVolumes: [{ muscle: "CHEST", plannedSets: 10 }],
    sessions: [],
  } as unknown as WeekForPlan;
}

describe("mesocyclePlanFromDb", () => {
  it("composes weeks into a MesocyclePlan, deriving meta from the weeks", () => {
    const plan = mesocyclePlanFromDb([week(1, false), week(2, false), week(3, true)], "UPPER_LOWER");
    expect(plan.weeks).toHaveLength(3);
    expect(plan.blockLengthWeeks).toBe(3);
    expect(plan.deloadWeekIndex).toBe(3);
    expect(plan.splitType).toBe("UPPER_LOWER");
    expect(plan.weeks[0]!.muscleVolume.CHEST).toBe(10);
    expect(plan.facts).toEqual([]);
  });

  it("orders weeks by index and tolerates no deload week (0)", () => {
    const plan = mesocyclePlanFromDb([week(2, false), week(1, false)], "PUSH_PULL_LEGS");
    expect(plan.weeks.map((w) => w.index)).toEqual([1, 2]);
    expect(plan.deloadWeekIndex).toBe(0);
  });
});
