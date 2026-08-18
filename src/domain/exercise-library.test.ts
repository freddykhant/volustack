import { describe, expect, it } from "vitest";
import { EXERCISE_LIBRARY } from "./exercise-library";

describe("EXERCISE_LIBRARY", () => {
  it("has unique exercise names", () => {
    const names = EXERCISE_LIBRARY.map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("gives every exercise exactly one PRIMARY muscle at fraction 1.0", () => {
    for (const ex of EXERCISE_LIBRARY) {
      const primaries = ex.muscles.filter((m) => m.role === "PRIMARY");
      expect(primaries.length, `${ex.name} primary count`).toBe(1);
      expect(primaries[0]!.fraction, `${ex.name} primary fraction`).toBe(1.0);
    }
  });

  it("keeps every SECONDARY fraction strictly between 0 and 1", () => {
    for (const ex of EXERCISE_LIBRARY) {
      for (const m of ex.muscles.filter((x) => x.role === "SECONDARY")) {
        expect(m.fraction, `${ex.name} ${m.muscle}`).toBeGreaterThan(0);
        expect(m.fraction, `${ex.name} ${m.muscle}`).toBeLessThan(1);
      }
    }
  });

  it("never lists the same muscle twice on one exercise", () => {
    for (const ex of EXERCISE_LIBRARY) {
      const ms = ex.muscles.map((m) => m.muscle);
      expect(new Set(ms).size, ex.name).toBe(ms.length);
    }
  });
});
