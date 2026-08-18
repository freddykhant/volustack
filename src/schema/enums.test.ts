import { describe, expect, it } from "vitest";
import { MUSCLE_GROUPS, MuscleGroupEnum, TrainingPhaseEnum } from "./enums";

describe("domain enums", () => {
  it("exposes all 14 MVP muscle groups", () => {
    expect(MUSCLE_GROUPS).toHaveLength(14);
    expect(MuscleGroupEnum.options).toContain("SIDE_DELTS");
    expect(MuscleGroupEnum.options).toContain("HAMSTRINGS");
  });

  it("defines the three training phases in order", () => {
    expect(TrainingPhaseEnum.options).toEqual(["CUT", "MAINTAIN", "BULK"]);
  });
});
