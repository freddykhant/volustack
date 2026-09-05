import { describe, expect, it } from "vitest";
import { mockReadiness } from "~/views/_fixtures/mock-readiness";

describe("mockReadiness", () => {
  it("has 6 weekly points", () => {
    expect(mockReadiness.series).toHaveLength(6);
  });

  it("form equals fitness minus fatigue for every point", () => {
    for (const p of mockReadiness.series) {
      expect(p.form).toBe(p.fitness - p.fatigue);
    }
  });

  it("includes the current week", () => {
    expect(
      mockReadiness.series.some((p) => p.weekIndex === mockReadiness.currentWeekIndex),
    ).toBe(true);
  });
});
