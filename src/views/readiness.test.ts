import { describe, expect, it } from "vitest";
import { toReadinessView } from "./readiness";

describe("toReadinessView", () => {
  it("wraps samples into a ReadinessView with the current week index", () => {
    const samples = [
      { weekIndex: 1, fitness: 3, fatigue: 4, form: -1 },
      { weekIndex: 2, fitness: 5, fatigue: 4, form: 1 },
    ];
    expect(toReadinessView(samples, 2)).toEqual({ series: samples, currentWeekIndex: 2 });
  });
  it("passes an empty series through", () => {
    expect(toReadinessView([], 1)).toEqual({ series: [], currentWeekIndex: 1 });
  });
});
