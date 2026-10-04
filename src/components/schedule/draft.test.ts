import { describe, expect, it } from "vitest";
import { makeInput, sess, withSaved } from "~/engine/_fixtures/schedule";
import type { Footprint, Layout, Placement } from "~/engine/schedule";
import {
  applyDrop,
  cellId,
  changedIds,
  dropTargets,
  parseCellId,
} from "./draft";

const day = (d: number): Placement => ({ day: d, daypart: null });
const LEGS: Footprint = { QUADS: 6, GLUTES: 4 };

describe("cellId / parseCellId", () => {
  it("round-trip both kinds of placement", () => {
    expect(parseCellId(cellId(day(3)))).toEqual(day(3));
    expect(parseCellId(cellId({ day: 3, daypart: "PM" }))).toEqual({
      day: 3,
      daypart: "PM",
    });
  });
});

describe("applyDrop", () => {
  const layout: Layout = { a: day(0), b: day(2) };
  const input = withSaved(
    makeInput({ sessions: [sess("a", 0, LEGS), sess("b", 1, LEGS)] }),
    layout,
  );

  it("moves a session to an empty day", () => {
    expect(applyDrop(input, layout, "a", day(4))).toEqual({
      a: day(4),
      b: day(2),
    });
  });

  it("swaps when the target is taken", () => {
    expect(applyDrop(input, layout, "a", day(2))).toEqual({
      a: day(2),
      b: day(0),
    });
  });

  it("returns the same object when dropped where it already is", () => {
    expect(applyDrop(input, layout, "a", day(0))).toBe(layout);
  });

  it("refuses a blocked day", () => {
    const blocked = {
      ...input,
      availability: [
        { day: 4, daypart: "AM" as const, state: "BLOCKED" as const },
        { day: 4, daypart: "PM" as const, state: "BLOCKED" as const },
      ],
    };
    expect(applyDrop(blocked, layout, "a", day(4))).toBe(layout);
  });

  it("refuses a day that has passed", () => {
    expect(applyDrop({ ...input, firstOpenDay: 3 }, layout, "a", day(1))).toBe(
      layout,
    );
  });

  it("refuses to drag a locked session, or to swap with one", () => {
    const locked = withSaved(
      makeInput({
        sessions: [sess("a", 0, LEGS, null, true), sess("b", 1, LEGS)],
      }),
      layout,
    );
    expect(applyDrop(locked, layout, "a", day(4))).toBe(layout);
    expect(applyDrop(locked, layout, "b", day(0))).toBe(layout);
  });

  it("refuses a swap that would push the other session into the past", () => {
    const past = { ...input, firstOpenDay: 1 }; // Monday has passed; "a" is stranded there
    expect(applyDrop(past, layout, "b", day(0))).toBe(layout);
  });

  it("places an unplaced session on an empty day but will not swap it in", () => {
    const partial: Layout = { b: day(2) };
    const unplaced = withSaved(
      makeInput({ sessions: [sess("a", 0, LEGS), sess("b", 1, LEGS)] }),
      partial,
    );
    expect(applyDrop(unplaced, partial, "a", day(5))).toEqual({
      a: day(5),
      b: day(2),
    });
    expect(applyDrop(unplaced, partial, "a", day(2))).toBe(partial);
  });

  it("lets a session return to its saved day even if that day is now blocked", () => {
    const blocked = {
      ...input,
      availability: [
        { day: 0, daypart: "AM" as const, state: "BLOCKED" as const },
        { day: 0, daypart: "PM" as const, state: "BLOCKED" as const },
      ],
    };
    const moved = applyDrop(blocked, layout, "a", day(4));
    expect(applyDrop(blocked, moved, "a", day(0))).toEqual(layout);
  });

  // Review Focus 2: a full week can still be rearranged.
  it("rearranges a seven-session week by swapping", () => {
    const sessions = Array.from({ length: 7 }, (_, i) =>
      sess(`s${i}`, i, LEGS),
    );
    const full: Layout = Object.fromEntries(
      sessions.map((s, i) => [s.id, day(i)]),
    );
    const fullInput = withSaved(makeInput({ sessions }), full);
    const next = applyDrop(fullInput, full, "s0", day(6));
    expect(next.s0).toEqual(day(6));
    expect(next.s6).toEqual(day(0));
  });

  it("swaps within a day in HALF_DAY mode", () => {
    const half: Layout = {
      a: { day: 1, daypart: "AM" },
      b: { day: 1, daypart: "PM" },
    };
    const halfInput = withSaved(
      makeInput({
        mode: "HALF_DAY",
        sessions: [sess("a", 0, LEGS), sess("b", 1, LEGS)],
      }),
      half,
    );
    expect(applyDrop(halfInput, half, "a", { day: 1, daypart: "PM" })).toEqual({
      a: { day: 1, daypart: "PM" },
      b: { day: 1, daypart: "AM" },
    });
  });
});

describe("changedIds", () => {
  it("lists sessions whose placement differs, including newly placed ones", () => {
    expect(
      changedIds({ a: day(0), b: day(2) }, { a: day(0), b: day(3), c: day(5) }),
    ).toEqual(["b", "c"]);
    expect(changedIds({ a: day(0) }, { a: day(0) })).toEqual([]);
  });
});

describe("dropTargets", () => {
  const layout: Layout = { a: day(0), b: day(3) };
  const input = withSaved(
    makeInput({
      firstOpenDay: 0,
      availability: [
        { day: 6, daypart: "AM", state: "BLOCKED" },
        { day: 6, daypart: "PM", state: "BLOCKED" },
      ],
      sessions: [sess("a", 0, LEGS), sess("b", 1, LEGS)],
    }),
    layout,
  );
  const kindOf = (d: number) =>
    dropTargets(input, layout, "b").find((t) => t.placement.day === d)!.kind;

  it("marks the current cell, refused cells, and cells that make things worse", () => {
    expect(kindOf(3)).toBe("current");
    expect(kindOf(6)).toBe("refused");
    expect(kindOf(1)).toBe("warn"); // the day after the other leg session
  });

  it("has one entry per cell", () => {
    expect(dropTargets(input, layout, "b")).toHaveLength(7);
  });
});
