import { describe, expect, it } from "vitest";
import { cellState } from "~/engine/schedule";
import { cycleCell, openDayCount } from "./availability";

describe("cycleCell", () => {
  it("cycles one half in HALF_DAY mode: available → preferred → blocked → available", () => {
    const a = cycleCell([], "HALF_DAY", 2, "PM");
    expect(a).toEqual([{ day: 2, daypart: "PM", state: "PREFERRED" }]);
    const b = cycleCell(a, "HALF_DAY", 2, "PM");
    expect(b).toEqual([{ day: 2, daypart: "PM", state: "BLOCKED" }]);
    expect(cycleCell(b, "HALF_DAY", 2, "PM")).toEqual([]);
  });

  it("leaves the other half alone in HALF_DAY mode", () => {
    const start = [
      { day: 2, daypart: "AM" as const, state: "BLOCKED" as const },
    ];
    expect(cycleCell(start, "HALF_DAY", 2, "PM")).toEqual([
      { day: 2, daypart: "AM", state: "BLOCKED" },
      { day: 2, daypart: "PM", state: "PREFERRED" },
    ]);
  });

  it("sets both halves together in DAY mode", () => {
    const a = cycleCell([], "DAY", 5, null);
    expect(cellState(a, "DAY", { day: 5, daypart: null })).toBe("PREFERRED");
    expect(a).toHaveLength(2);
    const b = cycleCell(a, "DAY", 5, null);
    expect(cellState(b, "DAY", { day: 5, daypart: null })).toBe("BLOCKED");
    expect(cycleCell(b, "DAY", 5, null)).toEqual([]);
  });

  it("normalises a half-set day when cycled in DAY mode", () => {
    const start = [
      { day: 5, daypart: "AM" as const, state: "BLOCKED" as const },
    ]; // reads as Available in DAY mode
    const next = cycleCell(start, "DAY", 5, null);
    expect(next).toEqual([
      { day: 5, daypart: "AM", state: "PREFERRED" },
      { day: 5, daypart: "PM", state: "PREFERRED" },
    ]);
  });
});

describe("openDayCount", () => {
  it("counts days that still have an open half", () => {
    expect(openDayCount([])).toBe(7);
    expect(
      openDayCount([
        { day: 0, daypart: "AM", state: "BLOCKED" },
        { day: 0, daypart: "PM", state: "BLOCKED" },
        { day: 1, daypart: "AM", state: "BLOCKED" },
      ]),
    ).toBe(6);
  });
});
