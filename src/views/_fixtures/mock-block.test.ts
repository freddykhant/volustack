import { describe, expect, it } from "vitest";
import { zoneFor } from "~/components/viz/zone";
import { mockMesocycle } from "./mock-block";

describe("mockMesocycle fixture", () => {
  it("has 6 weeks with the deload marked last", () => {
    expect(mockMesocycle.weeks).toHaveLength(6);
    expect(mockMesocycle.weeks.filter((w) => w.isDeload).map((w) => w.index)).toEqual([6]);
  });
  it("ramps chest volume up to a peak, then deloads", () => {
    const chest = (w: number) => mockMesocycle.weeks[w - 1]!.cells.find((c) => c.muscle === "CHEST")!.plannedSets;
    expect(chest(5)).toBeGreaterThan(chest(1));
    expect(chest(6)).toBeLessThan(chest(1)); // deload
  });
  it("exercises multiple zones across the block (heat-map is legible)", () => {
    const zones = new Set(
      mockMesocycle.weeks.flatMap((w) => w.cells.map((c) => zoneFor(c.plannedSets, c))),
    );
    expect(zones.size).toBeGreaterThan(1);
  });
  it("has fractional-credit prescriptions (a secondary chip < 1.0 exists)", () => {
    const chips = mockMesocycle.weeks[0]!.sessions.flatMap((s) => s.prescriptions.flatMap((p) => p.muscles));
    expect(chips.some((c) => c.role === "SECONDARY" && c.fraction < 1)).toBe(true);
  });
  it("reconciles the CHEST grid cell with the sum of sets×fraction across that week's sessions (regression guard)", () => {
    const week1 = mockMesocycle.weeks[0]!;
    const chestCell = week1.cells.find((c) => c.muscle === "CHEST")!;
    const expected = week1.sessions.reduce(
      (sum, s) =>
        sum +
        s.prescriptions.reduce(
          (n, p) => n + p.muscles.reduce((m, c) => m + (c.muscle === "CHEST" ? p.sets * c.fraction : 0), 0),
          0,
        ),
      0,
    );
    expect(chestCell.plannedSets).toBe(expected);
  });
});
