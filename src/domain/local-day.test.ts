import { describe, expect, it } from "vitest";
import { isoDateOfDayNumber, localDayNumber, localHour, weekdayOfDayNumber } from "./local-day";

describe("local-day", () => {
  // Review Focus 1: 2026-10-06 23:30 UTC is 10:30 on Wednesday 7 October in Sydney (UTC+11).
  const instant = new Date("2026-10-06T23:30:00Z");

  it("reads the local calendar date, not the UTC one", () => {
    const sydney = localDayNumber(instant, "Australia/Sydney");
    const utc = localDayNumber(instant, "UTC");
    expect(sydney - utc).toBe(1);
    expect(isoDateOfDayNumber(sydney)).toBe("2026-10-07");
    expect(isoDateOfDayNumber(utc)).toBe("2026-10-06");
  });

  it("maps day numbers to weekdays with Monday as 0", () => {
    expect(weekdayOfDayNumber(localDayNumber(instant, "Australia/Sydney"))).toBe(2); // Wed
    expect(weekdayOfDayNumber(localDayNumber(instant, "UTC"))).toBe(1); // Tue
    expect(weekdayOfDayNumber(0)).toBe(3); // 1970-01-01 was a Thursday
  });

  it("reads the local hour", () => {
    expect(localHour(instant, "Australia/Sydney")).toBe(10);
    expect(localHour(instant, "UTC")).toBe(23);
  });
});
