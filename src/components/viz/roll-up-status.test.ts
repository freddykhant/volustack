import { describe, expect, it } from "vitest";
import type { MuscleGroup } from "~/schema";
import type { MuscleWeekCell, WeekView } from "~/views/types";
import { rollUpStatus } from "~/components/viz/roll-up-status";

// Landmarks: mev=10, mav=16, mrv=22 → <10 rest, <16 building, <22 optimal, >=22 max.
const cell = (muscle: MuscleGroup, plannedSets: number): MuscleWeekCell => ({
  muscle,
  weekIndex: 1,
  plannedSets,
  mev: 10,
  mav: 16,
  mrv: 22,
});

function week(cells: MuscleWeekCell[], isDeload = false): WeekView {
  return { index: 1, isDeload, isCurrent: true, totalSets: 0, sessions: [], cells };
}

describe("rollUpStatus", () => {
  it("labels a deload week Recovering regardless of volume", () => {
    const w = week([cell("CHEST", 18), cell("BACK", 18)], true);
    expect(rollUpStatus(w).label).toBe("Recovering");
  });

  it("labels Overreaching when any muscle is at max", () => {
    const w = week([cell("CHEST", 22), cell("BACK", 12), cell("QUADS", 12)]);
    expect(rollUpStatus(w).label).toBe("Overreaching");
  });

  it("labels Optimal when optimal is a strict majority", () => {
    const w = week([cell("CHEST", 18), cell("BACK", 18), cell("QUADS", 12)]);
    const s = rollUpStatus(w);
    expect(s.label).toBe("Optimal");
    expect(s.counts.optimal).toBe(2);
  });

  it("labels Building when optimal is not a strict majority", () => {
    const w = week([cell("CHEST", 18), cell("BACK", 12)]);
    expect(rollUpStatus(w).label).toBe("Building");
  });

  it("counts inRange as cells at or above MEV", () => {
    const w = week([cell("CHEST", 18), cell("BACK", 12), cell("QUADS", 4)]);
    const s = rollUpStatus(w);
    expect(s.inRange).toBe(2); // 18 optimal + 12 building; 4 is rest
    expect(s.counts.rest).toBe(1);
    expect(s.total).toBe(3);
  });

  it("handles a zero-cell week", () => {
    const s = rollUpStatus(week([]));
    expect(s).toMatchObject({ label: "Building", total: 0, inRange: 0 });
  });
});
