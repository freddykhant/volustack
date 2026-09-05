import { describe, expect, it } from "vitest";
import { readinessState } from "~/components/viz/readiness-state";

describe("readinessState", () => {
  it("bands Form top-down, first match wins", () => {
    expect(readinessState(10)).toBe("Fresh");
    expect(readinessState(5)).toBe("Fresh"); // boundary
    expect(readinessState(0)).toBe("Productive");
    expect(readinessState(-10)).toBe("Productive"); // boundary
    expect(readinessState(-12)).toBe("Fatigued");
    expect(readinessState(-25)).toBe("Fatigued"); // boundary
    expect(readinessState(-30)).toBe("Overreaching");
  });
});
