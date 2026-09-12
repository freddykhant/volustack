import { describe, expect, it } from "vitest";
import type { OnboardingInput } from "~/schema";
import { buildConstraintSetInput, PROFICIENCY_TEMPLATE } from "./onboarding-template";

const base: OnboardingInput = {
  sex: "FEMALE",
  age: 30,
  heightCm: 168,
  weightKg: 64,
  daysPerWeek: 4,
  sessionLengthCapMin: 60,
  splitType: "PUSH_PULL_LEGS",
  proficiency: "INTERMEDIATE",
  priorityMuscles: [],
};

describe("PROFICIENCY_TEMPLATE", () => {
  it("maps each proficiency to block length and deload week", () => {
    expect(PROFICIENCY_TEMPLATE.BEGINNER).toEqual({ blockLengthWeeks: 4, deloadWeekIndex: 4 });
    expect(PROFICIENCY_TEMPLATE.INTERMEDIATE).toEqual({ blockLengthWeeks: 6, deloadWeekIndex: 6 });
    expect(PROFICIENCY_TEMPLATE.ADVANCED).toEqual({ blockLengthWeeks: 8, deloadWeekIndex: 8 });
  });
});

describe("buildConstraintSetInput", () => {
  it("passes logistics and split through unchanged", () => {
    const cs = buildConstraintSetInput(base);
    expect(cs.daysPerWeek).toBe(4);
    expect(cs.sessionLengthCapMin).toBe(60);
    expect(cs.splitType).toBe("PUSH_PULL_LEGS");
  });

  it("applies the proficiency template for block length and deload", () => {
    expect(buildConstraintSetInput({ ...base, proficiency: "BEGINNER" })).toMatchObject({
      blockLengthWeeks: 4,
      deloadWeekIndex: 4,
    });
    expect(buildConstraintSetInput({ ...base, proficiency: "ADVANCED" })).toMatchObject({
      blockLengthWeeks: 8,
      deloadWeekIndex: 8,
    });
  });

  it("maps priority muscles to muscleTargets at priority 3", () => {
    const cs = buildConstraintSetInput({ ...base, priorityMuscles: ["SIDE_DELTS", "BACK"] });
    expect(cs.muscleTargets).toEqual([
      { muscle: "SIDE_DELTS", priority: 3 },
      { muscle: "BACK", priority: 3 },
    ]);
  });

  it("produces empty muscleTargets when no priorities are given", () => {
    expect(buildConstraintSetInput(base).muscleTargets).toEqual([]);
  });

  it("drops priority muscles for BEGINNER (the engine ignores priority for beginners)", () => {
    const cs = buildConstraintSetInput({ ...base, proficiency: "BEGINNER", priorityMuscles: ["SIDE_DELTS", "BACK"] });
    expect(cs.muscleTargets).toEqual([]);
  });

  it("sets weekly cadence and no exclusions", () => {
    const cs = buildConstraintSetInput(base);
    expect(cs.checkInCadence).toBe("WEEKLY");
    expect(cs.excludedExerciseNames).toEqual([]);
  });
});
