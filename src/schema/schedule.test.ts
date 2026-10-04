import { describe, expect, it } from "vitest";
import {
  ApplyLayoutInputSchema,
  AvailabilityInputSchema,
  PlacementSchema,
  SchedulePrefsInputSchema,
  TimezoneSchema,
} from "./schedule";

describe("schedule schemas", () => {
  it("accepts a day-only and a half-day placement", () => {
    expect(PlacementSchema.parse({ day: 0, daypart: null })).toEqual({ day: 0, daypart: null });
    expect(PlacementSchema.parse({ day: 6, daypart: "PM" })).toEqual({ day: 6, daypart: "PM" });
  });

  it("rejects a day outside 0–6", () => {
    expect(PlacementSchema.safeParse({ day: 7, daypart: null }).success).toBe(false);
    expect(PlacementSchema.safeParse({ day: -1, daypart: null }).success).toBe(false);
  });

  it("rejects duplicate availability cells", () => {
    const dup = [
      { day: 1, daypart: "AM", state: "BLOCKED" },
      { day: 1, daypart: "AM", state: "PREFERRED" },
    ];
    expect(AvailabilityInputSchema.safeParse(dup).success).toBe(false);
  });

  it("accepts real timezones and rejects invented ones", () => {
    expect(TimezoneSchema.safeParse("Australia/Sydney").success).toBe(true);
    expect(TimezoneSchema.safeParse("UTC").success).toBe(true);
    expect(TimezoneSchema.safeParse("Mars/Olympus").success).toBe(false);
    expect(TimezoneSchema.safeParse("").success).toBe(false);
  });

  it("prefs default availability to empty", () => {
    expect(SchedulePrefsInputSchema.parse({ scheduleMode: "DAY" }).availability).toEqual([]);
  });

  it("apply input defaults carryForward to false", () => {
    const parsed = ApplyLayoutInputSchema.parse({
      weekIndex: 1,
      placements: [{ sessionId: "s1", day: 2, daypart: null }],
      expected: [{ sessionId: "s1", placement: null }],
      origin: "athlete",
    });
    expect(parsed.carryForward).toBe(false);
  });

  it("apply input rejects an unknown origin", () => {
    expect(
      ApplyLayoutInputSchema.safeParse({ weekIndex: 1, placements: [], expected: [], origin: "coach" }).success,
    ).toBe(false);
  });
});
