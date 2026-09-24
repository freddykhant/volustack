import { describe, expect, it } from "vitest";
import type { WeekPlan } from "~/engine";
import { toDeloadProposalView } from "./deload";

function wk(index: number, vol: Record<string, number>): WeekPlan {
  return {
    index,
    isDeload: false,
    sessions: [],
    muscleVolume: { ...emptyVol(), ...vol } as WeekPlan["muscleVolume"],
  };
}
function emptyVol() {
  // minimal: the mapper only reads muscles present with planned > 0
  return {} as Record<string, number>;
}

describe("toDeloadProposalView", () => {
  it("builds planned→deloaded rows for trained muscles with negative deltas", () => {
    const upcoming = wk(4, { CHEST: 12, BACK: 10 });
    const deloaded = wk(4, { CHEST: 6, BACK: 5 });
    const view = toDeloadProposalView(upcoming, deloaded, ["CHEST"], 3);
    expect(view.kind).toBe("DELOAD");
    expect(view.fromWeekIndex).toBe(3);
    expect(view.appliesToWeekIndex).toBe(4);
    expect(view.fatiguedMuscles).toEqual(["CHEST"]);
    const chest = view.rows.find((r) => r.muscle === "CHEST")!;
    expect(chest).toEqual({ muscle: "CHEST", plannedSets: 12, deloadedSets: 6, delta: -6 });
  });

  it("omits muscles the upcoming week doesn't train (planned 0)", () => {
    const upcoming = wk(4, { CHEST: 12 });
    const deloaded = wk(4, { CHEST: 6 });
    const view = toDeloadProposalView(upcoming, deloaded, [], 3);
    expect(view.rows.map((r) => r.muscle)).toEqual(["CHEST"]);
  });
});
