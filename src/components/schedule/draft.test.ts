import { describe, expect, it } from "vitest";
import { makeInput, sess, withSaved } from "~/engine/_fixtures/schedule";
import type { Footprint, Layout, Placement } from "~/engine/schedule";
import {
  applyDrop,
  cellId,
  changedIds,
  dropTargets,
  isDraftStale,
  optionStillValid,
  parseCellId,
  suggestionStillValid,
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

  // A full week can still be rearranged.
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

  it("places a session on a missed session's day without swapping", () => {
    const withMissed: Layout = { gone: day(0), b: day(2) };
    const missedInput = withSaved(
      makeInput({ sessions: [sess("gone", 0, LEGS, null, true, true), sess("b", 1, LEGS)] }),
      withMissed,
    );
    expect(applyDrop(missedInput, withMissed, "b", day(0))).toEqual({
      gone: day(0),
      b: day(0),
    });
    // The missed session itself still cannot be dragged.
    expect(applyDrop(missedInput, withMissed, "gone", day(4))).toBe(withMissed);
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

  it("offers a missed session's day as an ordinary target", () => {
    const withMissed: Layout = { gone: day(0), b: day(3) };
    const missedInput = withSaved(
      makeInput({ sessions: [sess("gone", 0, LEGS, null, true, true), sess("b", 1, LEGS)] }),
      withMissed,
    );
    const target = dropTargets(missedInput, withMissed, "b").find((t) => t.placement.day === 0)!;
    expect(["ok", "warn"]).toContain(target.kind);
  });

  it("has one entry per cell", () => {
    expect(dropTargets(input, layout, "b")).toHaveLength(7);
  });
});

describe("isDraftStale", () => {
  it("is false for the same layout, whatever the key order", () => {
    expect(
      isDraftStale({ a: day(0), b: day(2) }, { b: day(2), a: day(0) }),
    ).toBe(false);
  });

  it("is true when a session moved elsewhere", () => {
    expect(
      isDraftStale({ a: day(0), b: day(2) }, { a: day(0), b: day(3) }),
    ).toBe(true);
  });

  it("is true when a session was newly placed or unplaced elsewhere", () => {
    expect(isDraftStale({ a: day(0) }, { a: day(0), b: day(2) })).toBe(true);
    expect(isDraftStale({ a: day(0), b: day(2) }, { a: day(0) })).toBe(true);
  });
});

describe("isDraftStale with a session locked elsewhere", () => {
  const base: Layout = { a: day(0), b: day(2) };
  const draft: Layout = { a: day(0), b: day(4) }; // the draft moved b

  it("is true when a session the draft moved has since been completed or missed", () => {
    expect(isDraftStale(base, base, changedIds(base, draft), new Set(["b"]))).toBe(true);
  });

  it("is false when the locked session is not one the draft moved", () => {
    expect(isDraftStale(base, base, changedIds(base, draft), new Set(["a"]))).toBe(false);
  });

  it("is false when nothing is locked, and unchanged for callers that pass no extras", () => {
    expect(isDraftStale(base, base, changedIds(base, draft), new Set())).toBe(false);
    expect(isDraftStale(base, base)).toBe(false);
  });

  it("covers both sessions of a swap", () => {
    const swapped: Layout = { a: day(2), b: day(0) };
    expect(isDraftStale(base, base, changedIds(base, swapped), new Set(["a"]))).toBe(true);
  });
});

describe("suggestionStillValid", () => {
  const saved: Layout = { a: day(0), b: day(2) };

  it("holds while the session is still where the suggestion found it", () => {
    expect(
      suggestionStillValid(saved, {
        sessionId: "a",
        from: day(0),
        to: day(4),
        swapWithSessionId: null,
      }),
    ).toBe(true);
  });

  it("fails when the session has moved or been unplaced", () => {
    expect(
      suggestionStillValid(
        { a: day(1), b: day(2) },
        { sessionId: "a", from: day(0), to: day(4), swapWithSessionId: null },
      ),
    ).toBe(false);
    expect(
      suggestionStillValid(
        { b: day(2) },
        { sessionId: "a", from: day(0), to: day(4), swapWithSessionId: null },
      ),
    ).toBe(false);
  });

  it("for a swap, also needs the other session at the target", () => {
    const swap = {
      sessionId: "a",
      from: day(0),
      to: day(2),
      swapWithSessionId: "b",
    };
    expect(suggestionStillValid(saved, swap)).toBe(true);
    expect(suggestionStillValid({ a: day(0), b: day(3) }, swap)).toBe(false);
    expect(suggestionStillValid({ a: day(0) }, swap)).toBe(false);
  });
});

describe("optionStillValid", () => {
  const saved: Layout = { a: day(0), b: day(2) };
  const option = {
    layout: { a: day(0), b: day(4) } as Layout,
    placements: [{ sessionId: "b" }],
  };

  it("holds while the sessions it leaves alone have not moved", () => {
    expect(optionStillValid(saved, option, ["a", "b"])).toBe(true);
    // The session it moves may be anywhere now.
    expect(optionStillValid({ a: day(0), b: day(5) }, option, ["a", "b"])).toBe(
      true,
    );
  });

  it("fails when a session it leaves alone has moved or been unplaced", () => {
    expect(optionStillValid({ a: day(1), b: day(2) }, option, ["a", "b"])).toBe(
      false,
    );
    expect(optionStillValid({ b: day(2) }, option, ["a", "b"])).toBe(false);
  });

  it("fails when a session it moves no longer exists", () => {
    expect(optionStillValid(saved, option, ["a"])).toBe(false);
  });
});
