// src/engine/util.test.ts
import { describe, expect, it } from "vitest";
import { MUSCLE_GROUPS } from "~/schema";
import { EXERCISE_LIBRARY } from "~/domain/exercise-library";
import { ALL_MUSCLES, computeVolume, emptyVolumeMap, round1 } from "./util";

describe("engine util", () => {
  it("ALL_MUSCLES matches the Zod muscle enum exactly", () => {
    expect([...ALL_MUSCLES].sort()).toEqual([...MUSCLE_GROUPS].sort());
  });

  it("emptyVolumeMap zeroes every muscle", () => {
    const m = emptyVolumeMap();
    for (const muscle of ALL_MUSCLES) expect(m[muscle]).toBe(0);
  });

  it("round1 rounds to one decimal", () => {
    expect(round1(1.049)).toBe(1);
    expect(round1(1.05)).toBe(1.1);
  });

  it("computeVolume credits primary fully and secondary fractionally", () => {
    // Barbell Row: BACK 1.0 primary, BICEPS 0.5, REAR_DELTS 0.5 secondary
    const vol = computeVolume([{ exerciseName: "Barbell Row", sets: 4 }], EXERCISE_LIBRARY);
    expect(vol.BACK).toBe(4);
    expect(vol.BICEPS).toBe(2);
    expect(vol.REAR_DELTS).toBe(2);
    expect(vol.CHEST).toBe(0);
  });
});
