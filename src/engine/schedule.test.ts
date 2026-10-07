import { describe, expect, it } from "vitest";
import { EXERCISE_LIBRARY } from "~/domain/exercise-library";
import {
  allCells,
  cellState,
  checkLayout,
  dayIndex,
  daypartForDay,
  footprintOf,
  layoutKey,
  openCells,
  placementPosition,
  savedLayout,
  type Placement,
} from "./schedule";
import { makeInput, sess } from "./_fixtures/schedule";

const day = (d: number): Placement => ({ day: d, daypart: null });

describe("positions", () => {
  it("counts days from the week's first day, wrapping", () => {
    expect(dayIndex(2, 2)).toBe(0); // Wed in a Wed-start week
    expect(dayIndex(1, 2)).toBe(6); // Tue is the last day of that week
  });

  it("measures position in half-days", () => {
    expect(placementPosition({ day: 0, daypart: null }, 0)).toBe(0);
    expect(placementPosition({ day: 0, daypart: "PM" }, 0)).toBe(1);
    expect(placementPosition({ day: 1, daypart: "AM" }, 0)).toBe(2);
    expect(placementPosition({ day: 1, daypart: null }, 2)).toBe(12);
  });

  it("lists 7 cells in DAY mode and 14 in HALF_DAY", () => {
    expect(allCells("DAY")).toHaveLength(7);
    expect(allCells("HALF_DAY")).toHaveLength(14);
  });
});

describe("cellState", () => {
  const availability = [
    { day: 1, daypart: "AM" as const, state: "BLOCKED" as const },
    { day: 1, daypart: "PM" as const, state: "BLOCKED" as const },
    { day: 2, daypart: "AM" as const, state: "BLOCKED" as const },
    { day: 3, daypart: "PM" as const, state: "PREFERRED" as const },
  ];

  it("reads the exact cell in HALF_DAY mode", () => {
    expect(cellState(availability, "HALF_DAY", { day: 2, daypart: "AM" })).toBe("BLOCKED");
    expect(cellState(availability, "HALF_DAY", { day: 2, daypart: "PM" })).toBe("AVAILABLE");
  });

  it("collapses halves in DAY mode: blocked only when both are, preferred when either is", () => {
    expect(cellState(availability, "DAY", day(1))).toBe("BLOCKED");
    expect(cellState(availability, "DAY", day(2))).toBe("AVAILABLE");
    expect(cellState(availability, "DAY", day(3))).toBe("PREFERRED");
    expect(cellState(availability, "DAY", day(4))).toBe("AVAILABLE");
  });
});

describe("openCells", () => {
  it("drops blocked and past cells and keeps position order", () => {
    const input = makeInput({
      weekStartDay: 2, // Wed … Tue
      firstOpenDay: 1, // Wed is past
      availability: [
        { day: 4, daypart: "AM", state: "BLOCKED" },
        { day: 4, daypart: "PM", state: "BLOCKED" },
      ],
    });
    expect(openCells(input).map((c) => c.day)).toEqual([3, 5, 6, 0, 1]);
  });
});

describe("daypartForDay", () => {
  it("defaults to AM", () => {
    expect(daypartForDay([], 0)).toBe("AM");
  });
  it("takes PM when only PM is preferred", () => {
    expect(daypartForDay([{ day: 0, daypart: "PM", state: "PREFERRED" }], 0)).toBe("PM");
  });
  it("takes PM when AM is blocked and PM is not", () => {
    expect(daypartForDay([{ day: 0, daypart: "AM", state: "BLOCKED" }], 0)).toBe("PM");
  });
  it("stays AM when both halves are preferred", () => {
    expect(
      daypartForDay(
        [
          { day: 0, daypart: "AM", state: "PREFERRED" },
          { day: 0, daypart: "PM", state: "PREFERRED" },
        ],
        0,
      ),
    ).toBe("AM");
  });
});

describe("footprintOf", () => {
  it("credits primary and secondary muscles and omits untouched ones", () => {
    const fp = footprintOf([{ exerciseName: "Barbell Bench Press", sets: 4 }], EXERCISE_LIBRARY);
    expect(fp.CHEST).toBe(4);
    expect(fp.QUADS).toBeUndefined();
  });

  it("ignores exercises missing from the library", () => {
    expect(footprintOf([{ exerciseName: "Not A Lift", sets: 3 }], EXERCISE_LIBRARY)).toEqual({});
  });
});

describe("layout helpers", () => {
  it("savedLayout collects placed sessions only", () => {
    const input = makeInput({ sessions: [sess("a", 0, {}, day(1)), sess("b", 1, {})] });
    expect(savedLayout(input)).toEqual({ a: day(1) });
  });

  it("layoutKey is order-independent", () => {
    expect(layoutKey({ b: day(2), a: { day: 1, daypart: "PM" } })).toBe("a:1:PM|b:2:-");
  });
});

describe("checkLayout", () => {
  it("accepts a legal layout", () => {
    const input = makeInput({ sessions: [sess("a", 0, {}), sess("b", 1, {})] });
    expect(checkLayout(input, { a: day(0), b: day(2) })).toEqual([]);
  });

  it("refuses a move into a blocked cell", () => {
    const input = makeInput({
      sessions: [sess("a", 0, {}, day(0))],
      availability: [
        { day: 3, daypart: "AM", state: "BLOCKED" },
        { day: 3, daypart: "PM", state: "BLOCKED" },
      ],
    });
    expect(checkLayout(input, { a: day(3) })).toEqual([{ kind: "blocked_cell", sessionId: "a" }]);
  });

  it("does not refuse a session that merely stands on a newly blocked cell", () => {
    const input = makeInput({
      sessions: [sess("a", 0, {}, day(3))],
      availability: [
        { day: 3, daypart: "AM", state: "BLOCKED" },
        { day: 3, daypart: "PM", state: "BLOCKED" },
      ],
    });
    expect(checkLayout(input, { a: day(3) })).toEqual([]);
  });

  it("refuses a move into the past but lets a session stay there", () => {
    const input = makeInput({ firstOpenDay: 2, sessions: [sess("a", 0, {}, day(0)), sess("b", 1, {}, day(4))] });
    expect(checkLayout(input, { a: day(0), b: day(1) })).toEqual([{ kind: "in_past", sessionId: "b" }]);
  });

  it("refuses moving a locked session", () => {
    const input = makeInput({ sessions: [sess("a", 0, {}, day(0), true)] });
    expect(checkLayout(input, { a: day(2) })).toEqual([{ kind: "locked", sessionId: "a" }]);
  });

  it("refuses two sessions on one day in DAY mode", () => {
    const input = makeInput({ sessions: [sess("a", 0, {}), sess("b", 1, {})] });
    expect(checkLayout(input, { a: day(1), b: day(1) })).toEqual([{ kind: "day_limit", sessionId: "b" }]);
  });

  it("allows AM and PM on one day in HALF_DAY mode but not the same half", () => {
    const input = makeInput({ mode: "HALF_DAY", sessions: [sess("a", 0, {}), sess("b", 1, {})] });
    expect(checkLayout(input, { a: { day: 1, daypart: "AM" }, b: { day: 1, daypart: "PM" } })).toEqual([]);
    expect(checkLayout(input, { a: { day: 1, daypart: "AM" }, b: { day: 1, daypart: "AM" } })).toEqual([
      { kind: "occupied", sessionId: "b" },
    ]);
  });

  it("refuses a daypart in DAY mode and a missing one in HALF_DAY mode", () => {
    const dayInput = makeInput({ sessions: [sess("a", 0, {})] });
    expect(checkLayout(dayInput, { a: { day: 1, daypart: "AM" } })).toEqual([{ kind: "mode_mismatch", sessionId: "a" }]);
    const halfInput = makeInput({ mode: "HALF_DAY", sessions: [sess("a", 0, {})] });
    expect(checkLayout(halfInput, { a: day(1) })).toEqual([{ kind: "mode_mismatch", sessionId: "a" }]);
  });

  it("refuses a session id that is not in the week", () => {
    const input = makeInput({ sessions: [sess("a", 0, {})] });
    expect(checkLayout(input, { a: day(0), ghost: day(1) })).toEqual([{ kind: "unknown_session", sessionId: "ghost" }]);
  });

  // Locked sessions left in an old shape must not poison the week.
  it("ignores a locked session with no daypart in HALF_DAY mode", () => {
    const input = makeInput({
      mode: "HALF_DAY",
      sessions: [sess("done", 0, {}, day(0), true), sess("a", 1, {}, { day: 2, daypart: "AM" })],
    });
    expect(checkLayout(input, { done: day(0), a: { day: 3, daypart: "AM" } })).toEqual([]);
  });

  it("ignores two locked sessions sharing a day in DAY mode", () => {
    const input = makeInput({
      sessions: [
        sess("d1", 0, {}, { day: 0, daypart: "AM" }, true),
        sess("d2", 1, {}, { day: 0, daypart: "PM" }, true),
        sess("a", 2, {}, day(2)),
      ],
    });
    expect(
      checkLayout(input, { d1: { day: 0, daypart: "AM" }, d2: { day: 0, daypart: "PM" }, a: day(4) }),
    ).toEqual([]);
  });

  it("does not freeze the week over a locked and an unlocked session that already share a day", () => {
    // A completed AM session and a scheduled PM one, then a switch to one-a-day: neither moved.
    const input = makeInput({
      sessions: [sess("done", 0, {}, day(0), true), sess("pm", 1, {}, day(0)), sess("a", 2, {}, day(2))],
    });
    expect(checkLayout(input, { done: day(0), pm: day(0), a: day(4) })).toEqual([]);
  });

  it("does not freeze the week over two unlocked sessions that already share a day", () => {
    const input = makeInput({
      sessions: [sess("x", 0, {}, day(1)), sess("y", 1, {}, day(1)), sess("a", 2, {}, day(2))],
    });
    expect(checkLayout(input, { x: day(1), y: day(1), a: day(4) })).toEqual([]);
  });

  it("still refuses moving an unlocked session onto a locked one's day, with others standing", () => {
    const input = makeInput({
      sessions: [sess("done", 0, {}, day(0), true), sess("x", 1, {}, day(1)), sess("a", 2, {}, day(2))],
    });
    expect(checkLayout(input, { done: day(0), x: day(1), a: day(0) })).toEqual([{ kind: "day_limit", sessionId: "a" }]);
  });

  it("blames the session that moved when it lands on one that stood still", () => {
    const input = makeInput({ sessions: [sess("x", 0, {}, day(1)), sess("y", 1, {}, day(3))] });
    // x moved onto y; x is earlier by order but y did not move.
    expect(checkLayout(input, { x: day(3), y: day(3) })).toEqual([{ kind: "day_limit", sessionId: "x" }]);
  });

  it("still refuses moving a session onto an occupied half-day in HALF_DAY mode", () => {
    const am = (d: number) => ({ day: d, daypart: "AM" as const });
    const input = makeInput({
      mode: "HALF_DAY",
      sessions: [sess("x", 0, {}, am(1)), sess("y", 1, {}, am(1)), sess("a", 2, {}, am(2)), sess("b", 3, {}, am(3))],
    });
    // x and y already share Tuesday AM (older shape); moving b onto Wednesday AM is refused, the standing pair is not.
    expect(checkLayout(input, { x: am(1), y: am(1), a: am(2), b: am(4) })).toEqual([]);
    expect(checkLayout(input, { x: am(1), y: am(1), a: am(2), b: am(2) })).toEqual([{ kind: "occupied", sessionId: "b" }]);
    // Moving one of the pair itself onto another's cell is refused too.
    expect(checkLayout(input, { x: am(2), y: am(1), a: am(2), b: am(3) })).toEqual([{ kind: "occupied", sessionId: "x" }]);
  });

  it("still refuses an unlocked session joining a locked one's day in DAY mode", () => {
    const input = makeInput({ sessions: [sess("done", 0, {}, day(0), true), sess("a", 1, {}, day(2))] });
    expect(checkLayout(input, { done: day(0), a: day(0) })).toEqual([{ kind: "day_limit", sessionId: "a" }]);
  });
});

describe("checkLayout — inert (missed) sessions", () => {
  it("lets another session take a missed session's day in DAY mode", () => {
    const input = makeInput({ sessions: [sess("missed", 0, {}, day(0), true, true), sess("a", 1, {}, day(2))] });
    expect(checkLayout(input, { missed: day(0), a: day(0) })).toEqual([]);
  });

  it("lets another session take a missed session's half-day in HALF_DAY mode", () => {
    const am = { day: 1, daypart: "AM" as const };
    const input = makeInput({
      mode: "HALF_DAY",
      sessions: [sess("missed", 0, {}, am, true, true), sess("a", 1, {}, { day: 2, daypart: "AM" })],
    });
    expect(checkLayout(input, { missed: am, a: am })).toEqual([]);
  });

  it("still refuses moving a missed session", () => {
    const input = makeInput({ sessions: [sess("missed", 0, {}, day(0), true, true)] });
    expect(checkLayout(input, { missed: day(2) })).toEqual([{ kind: "locked", sessionId: "missed" }]);
  });
});

