import { describe, expect, it } from "vitest";
import { OnboardingInputSchema } from "./onboarding";

const valid = {
  sex: "MALE" as const,
  age: 28,
  heightCm: 180,
  weightKg: 82,
  daysPerWeek: 5,
  sessionLengthCapMin: 75,
  splitType: "UPPER_LOWER" as const,
  proficiency: "INTERMEDIATE" as const,
  priorityMuscles: ["SIDE_DELTS" as const],
};

describe("OnboardingInputSchema", () => {
  it("accepts a valid payload", () => {
    expect(OnboardingInputSchema.parse(valid)).toMatchObject(valid);
  });

  it("defaults priorityMuscles to an empty array", () => {
    const { priorityMuscles, ...rest } = valid;
    expect(OnboardingInputSchema.parse(rest).priorityMuscles).toEqual([]);
  });

  it("rejects age out of bounds", () => {
    expect(OnboardingInputSchema.safeParse({ ...valid, age: 12 }).success).toBe(false);
    expect(OnboardingInputSchema.safeParse({ ...valid, age: 101 }).success).toBe(false);
  });

  it("rejects height/weight out of bounds", () => {
    expect(OnboardingInputSchema.safeParse({ ...valid, heightCm: 119 }).success).toBe(false);
    expect(OnboardingInputSchema.safeParse({ ...valid, weightKg: 29 }).success).toBe(false);
  });

  it("rejects daysPerWeek outside 1–7", () => {
    expect(OnboardingInputSchema.safeParse({ ...valid, daysPerWeek: 0 }).success).toBe(false);
    expect(OnboardingInputSchema.safeParse({ ...valid, daysPerWeek: 8 }).success).toBe(false);
  });

  it("rejects more than 3 priority muscles", () => {
    expect(
      OnboardingInputSchema.safeParse({
        ...valid,
        priorityMuscles: ["CHEST", "BACK", "QUADS", "BICEPS"],
      }).success,
    ).toBe(false);
  });
});
