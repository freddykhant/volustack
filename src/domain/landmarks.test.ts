import { describe, expect, it } from "vitest";
import { MUSCLE_GROUPS } from "~/schema";
import { DEFAULT_LANDMARKS } from "./landmarks";

describe("DEFAULT_LANDMARKS", () => {
  it("defines landmarks for every muscle group", () => {
    for (const m of MUSCLE_GROUPS) {
      expect(DEFAULT_LANDMARKS[m], `missing landmarks for ${m}`).toBeDefined();
    }
  });

  it("satisfies MEV < MAV < MRV for every muscle", () => {
    for (const m of MUSCLE_GROUPS) {
      const { mev, mav, mrv } = DEFAULT_LANDMARKS[m];
      expect(mev, `${m} MEV`).toBeLessThan(mav);
      expect(mav, `${m} MAV`).toBeLessThan(mrv);
      expect(mev, `${m} MEV`).toBeGreaterThanOrEqual(0);
    }
  });
});
