import { describe, expect, it } from "vitest";
import {
  ApplyLayoutInputSchema,
  AvailabilityInputSchema,
  ExceptionInputSchema,
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

describe("ExceptionInputSchema", () => {
  it("accepts a calendar date with a daypart or null", () => {
    expect(ExceptionInputSchema.safeParse({ date: "2026-10-08", daypart: null }).success).toBe(true);
    expect(ExceptionInputSchema.safeParse({ date: "2026-10-08", daypart: "PM" }).success).toBe(true);
  });
  it("rejects a date that is malformed or not on the calendar", () => {
    expect(ExceptionInputSchema.safeParse({ date: "8/10/2026", daypart: null }).success).toBe(false);
    expect(ExceptionInputSchema.safeParse({ date: "2026-02-30", daypart: null }).success).toBe(false);
    expect(ExceptionInputSchema.safeParse({ date: "2026-10-08T00:00:00Z", daypart: null }).success).toBe(false);
  });
});

describe("ApplyLayoutInputSchema replacement origin", () => {
  it("accepts the replacement origin", () => {
    const parsed = ApplyLayoutInputSchema.safeParse({ weekIndex: 1, placements: [], expected: [], origin: "replacement" });
    expect(parsed.success).toBe(true);
  });
});
