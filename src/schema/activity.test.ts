import { describe, expect, it } from "vitest";
import { ActivityAddInputSchema, ActivityRemoveInputSchema, MAX_ACTIVITIES_PER_DAY } from "./activity";

const base = { weekIndex: 1, date: "2026-10-20", daypart: "AM", kind: "RUN", intensity: "HARD", durationMin: 45 } as const;

describe("ActivityAddInputSchema", () => {
  it("accepts a full activity and one with no daypart or duration", () => {
    expect(ActivityAddInputSchema.safeParse(base).success).toBe(true);
    expect(ActivityAddInputSchema.safeParse({ ...base, daypart: null, durationMin: null }).success).toBe(true);
  });
  it("bounds the duration to 5–600 whole minutes", () => {
    for (const durationMin of [4, 601, 30.5]) {
      expect(ActivityAddInputSchema.safeParse({ ...base, durationMin }).success).toBe(false);
    }
    for (const durationMin of [5, 600]) {
      expect(ActivityAddInputSchema.safeParse({ ...base, durationMin }).success).toBe(true);
    }
  });
  it("refuses an unknown kind or intensity and a malformed date", () => {
    expect(ActivityAddInputSchema.safeParse({ ...base, kind: "HIKE" }).success).toBe(false);
    expect(ActivityAddInputSchema.safeParse({ ...base, intensity: "MAX" }).success).toBe(false);
    expect(ActivityAddInputSchema.safeParse({ ...base, date: "20-10-2026" }).success).toBe(false);
  });
});

describe("ActivityRemoveInputSchema", () => {
  it("needs a week and an id", () => {
    expect(ActivityRemoveInputSchema.safeParse({ weekIndex: 1, id: "a1" }).success).toBe(true);
    expect(ActivityRemoveInputSchema.safeParse({ weekIndex: 1, id: "" }).success).toBe(false);
  });
});

it("caps a day at three activities", () => {
  expect(MAX_ACTIVITIES_PER_DAY).toBe(3);
});
