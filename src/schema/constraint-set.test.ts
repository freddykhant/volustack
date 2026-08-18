import { describe, expect, it } from "vitest";
import { ConstraintSetInputSchema } from "./constraint-set";

const valid = {
  daysPerWeek: 5,
  splitType: "UPPER_LOWER" as const,
  sessionLengthCapMin: 60,
  blockLengthWeeks: 6,
  checkInCadence: "WEEKLY" as const,
  muscleTargets: [
    { muscle: "CHEST" as const, weeklySetTarget: 16, priority: 0 },
    { muscle: "SIDE_DELTS" as const, priority: 2 },
  ],
  excludedExerciseNames: ["Barbell Back Squat"],
};

describe("ConstraintSetInputSchema", () => {
  it("accepts a valid constraint set", () => {
    expect(ConstraintSetInputSchema.parse(valid)).toMatchObject({
      daysPerWeek: 5,
    });
  });

  it("applies defaults for the optional collections", () => {
    const parsed = ConstraintSetInputSchema.parse({
      daysPerWeek: 3,
      splitType: "FULL_BODY",
      sessionLengthCapMin: 45,
      blockLengthWeeks: 4,
    });
    expect(parsed.checkInCadence).toBe("WEEKLY");
    expect(parsed.muscleTargets).toEqual([]);
    expect(parsed.excludedExerciseNames).toEqual([]);
  });

  it("rejects daysPerWeek outside 1..7", () => {
    expect(() =>
      ConstraintSetInputSchema.parse({ ...valid, daysPerWeek: 9 }),
    ).toThrow();
  });

  it("rejects a negative session length", () => {
    expect(() =>
      ConstraintSetInputSchema.parse({ ...valid, sessionLengthCapMin: -5 }),
    ).toThrow();
  });
});
