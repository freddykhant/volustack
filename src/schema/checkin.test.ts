import { describe, expect, it } from "vitest";
import { CheckInMuscleInputSchema, WeeklyCheckInInputSchema } from "./checkin";

describe("CheckInMuscleInputSchema", () => {
  const base = { muscle: "CHEST", recovery: 2, joint: 0 };
  it("accepts in-range 0-3 scores", () => {
    expect(CheckInMuscleInputSchema.parse(base).recovery).toBe(2);
  });
  it("rejects out-of-range scores", () => {
    expect(() => CheckInMuscleInputSchema.parse({ ...base, recovery: 4 })).toThrow();
    expect(() => CheckInMuscleInputSchema.parse({ ...base, joint: -1 })).toThrow();
  });
  it("rejects non-integer scores", () => {
    expect(() => CheckInMuscleInputSchema.parse({ ...base, recovery: 1.5 })).toThrow();
  });
  it("rejects an unknown muscle", () => {
    expect(() => CheckInMuscleInputSchema.parse({ ...base, muscle: "NECK" })).toThrow();
  });
});

describe("WeeklyCheckInInputSchema", () => {
  it("accepts a week index + muscle list", () => {
    const parsed = WeeklyCheckInInputSchema.parse({
      weekIndex: 3,
      muscles: [{ muscle: "CHEST", recovery: 2, joint: 0 }],
    });
    expect(parsed.muscles).toHaveLength(1);
  });
  it("rejects weekIndex < 1", () => {
    expect(() => WeeklyCheckInInputSchema.parse({ weekIndex: 0, muscles: [] })).toThrow();
  });
});
