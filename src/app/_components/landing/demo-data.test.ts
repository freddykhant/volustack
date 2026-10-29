import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { readinessState } from "~/components/viz/readiness-state";
import { DEMO_CUE } from "./demo-cue";
import { BLOCK_GRID, PROGRESSION, READINESS_SERIES, formPercent, zoneFor } from "./demo-data";

// The landing's numbers are illustrative, but they must look like something the engine would produce.
describe("landing demo data", () => {
  it("deloads each muscle to roughly half its peak", () => {
    for (const row of BLOCK_GRID) {
      const peak = Math.max(...row.weeks);
      expect(row.deload / peak, row.muscle).toBeGreaterThanOrEqual(0.4);
      expect(row.deload / peak, row.muscle).toBeLessThanOrEqual(0.6);
    }
  });

  it("only ever climbs through the block's weeks", () => {
    for (const row of BLOCK_GRID) {
      row.weeks.forEach((sets, i) => i > 0 && expect(sets, row.muscle).toBeGreaterThanOrEqual(row.weeks[i - 1]!));
    }
  });

  it("doesn't reach max volume before week 4", () => {
    for (const row of BLOCK_GRID) {
      row.weeks.slice(0, 3).forEach((sets) => expect(zoneFor(sets, row.muscle), row.muscle).not.toBe("max"));
    }
  });

  it("ends on a Form the app itself would call Productive", () => {
    const last = READINESS_SERIES.at(-1)!;
    expect(last.form).toBeLessThan(0);
    expect(readinessState(last)).toBe("Productive");
    expect(formPercent(last)).toBe(Math.round((last.form / last.fitness) * 100));
  });

  it("proposes week 4's chest volume from week 3's, as the block grid shows them", () => {
    const chest = BLOCK_GRID.find((r) => r.muscle === "Chest")!;
    expect(PROGRESSION).toContainEqual({ muscle: "Chest", from: chest.weeks[2], to: chest.weeks[3] });
    expect(PROGRESSION).toContainEqual({ muscle: "Quads", from: 14, to: null, note: "hold, recovery low" });
  });

  it("shows a coach cue the app itself would produce: a lift then a run, carbs between, in grams", () => {
    expect(DEMO_CUE.kind).toBe("fuel_between");
    expect(DEMO_CUE.title).toMatch(/^Lower B, then .*run$/);
    expect(DEMO_CUE.line).toMatch(/\d+–\d+ g of carbs (between them|in between the two)/);
    const src = readFileSync("src/app/_components/landing/vignettes/coach-cue.tsx", "utf8");
    expect(src).toContain("DEMO_CUE");
    expect(src).not.toMatch(/g\/kg|Two big days/);
  });
});
