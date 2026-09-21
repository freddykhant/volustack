import { describe, expect, it } from "vitest";
import { readinessState, FITNESS_FLOOR } from "./readiness-state";

describe("readinessState", () => {
  it("returns Building when fitness is below the floor", () => {
    expect(readinessState({ fitness: FITNESS_FLOOR - 0.1, form: 0 })).toBe("Building");
  });
  it("bands on form/fitness percentage", () => {
    expect(readinessState({ fitness: 10, form: 1 })).toBe("Fresh"); // +10%
    expect(readinessState({ fitness: 10, form: 0 })).toBe("Productive"); // 0%
    expect(readinessState({ fitness: 10, form: -2 })).toBe("Fatigued"); // -20%
    expect(readinessState({ fitness: 10, form: -4 })).toBe("Overreaching"); // -40%
  });
  it("uses inclusive lower boundaries (+5% Fresh, -10% Productive, -30% Fatigued)", () => {
    expect(readinessState({ fitness: 100, form: 5 })).toBe("Fresh");
    expect(readinessState({ fitness: 100, form: -10 })).toBe("Productive");
    expect(readinessState({ fitness: 100, form: -30 })).toBe("Fatigued");
  });
});
