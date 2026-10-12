import { describe, expect, it } from "vitest";
import { makeInput, sess, withSaved } from "./_fixtures/schedule";
import {
  checkLayout,
  cellState,
  isCrowded,
  isStranded,
  nominateOverflow,
  proposeLayouts,
  type AvailabilityCellInput,
  type Layout,
  type ScheduleInput,
} from "./schedule";

const day = (d: number) => ({ day: d, daypart: null });
const blockDay = (d: number): AvailabilityCellInput[] => [
  { day: d, daypart: "AM", state: "BLOCKED", oneOff: true },
  { day: d, daypart: "PM", state: "BLOCKED", oneOff: true },
];

const three = makeInput({
  sessions: [sess("push", 0, { CHEST: 8 }), sess("pull", 1, { BACK: 8 }), sess("legs", 2, { QUADS: 8 })],
});
const saved3: Layout = { push: day(0), pull: day(2), legs: day(4) };

/** Six sessions Mon…Sat, Sunday free. */
const six = makeInput({
  sessions: ["a", "b", "c", "d", "e", "f"].map((id, i) => sess(id, i, { CHEST: 2 + i })),
});
const saved6: Layout = Object.fromEntries(["a", "b", "c", "d", "e", "f"].map((id, i) => [id, day(i)]));

function assertLegal(input: ScheduleInput, layout: Layout) {
  expect(checkLayout(input, layout)).toEqual([]);
  for (const s of input.sessions) {
    const p = layout[s.id];
    if (p && !s.locked) expect(cellState(input.availability, input.mode, p)).not.toBe("BLOCKED");
  }
}

describe("isStranded / isCrowded", () => {
  it("is stranded only when a movable session stands on a blocked cell", () => {
    expect(isStranded(withSaved(three, saved3))).toBe(false);
    expect(isStranded(withSaved({ ...three, availability: blockDay(2) }, saved3))).toBe(true);
    const done = withSaved(
      { ...three, availability: blockDay(2), sessions: [three.sessions[0]!, sess("pull", 1, { BACK: 8 }, null, true), three.sessions[2]!] },
      saved3,
    );
    expect(isStranded(done)).toBe(false);
  });

  it("is crowded when movable sessions outnumber free days", () => {
    expect(isCrowded(withSaved({ ...six, availability: blockDay(3) }, saved6))).toBe(false); // 6 sessions, 6 days
    expect(isCrowded(withSaved({ ...six, availability: [...blockDay(3), ...blockDay(6)] }, saved6))).toBe(true);
  });
});

describe("proposeLayouts, roomy week", () => {
  const input = withSaved({ ...three, availability: blockDay(2) }, saved3);
  const options = proposeLayouts(input);

  it("returns one to three distinct, legal options with unique ids", () => {
    expect(options.length).toBeGreaterThanOrEqual(1);
    expect(options.length).toBeLessThanOrEqual(3);
    expect(new Set(options.map((o) => o.id)).size).toBe(options.length);
    for (const o of options) {
      assertLegal(input, o.layout);
      expect(o.overflow).toBeNull();
      expect(o.skipped).toEqual([]);
      expect(o.fit).toEqual([]);
      expect(Object.keys(o.layout).sort()).toEqual(["legs", "pull", "push"]);
    }
  });

  it("lists exactly the sessions that changed placement as moves", () => {
    for (const o of options) {
      const changed = Object.keys(o.layout).filter(
        (id) => o.layout[id]!.day !== saved3[id]!.day,
      );
      expect(o.moves.map((m) => m.sessionId).sort()).toEqual(changed.sort());
      for (const m of o.moves) expect(m.from).toEqual(saved3[m.sessionId]);
    }
  });

  it("includes an option that moves only the blocked session", () => {
    expect(options.some((o) => o.moves.length === 1 && o.moves[0]!.sessionId === "pull")).toBe(true);
  });

  it("is deterministic", () => {
    expect(proposeLayouts(input)).toEqual(options);
  });

  it("never returns an option that changes nothing", () => {
    expect(proposeLayouts(withSaved(three, saved3)).every((o) => o.moves.length > 0)).toBe(true);
  });
});

describe("proposeLayouts, fixed sessions", () => {
  it("leaves a completed session on a blocked day and offers nothing for it", () => {
    const input = withSaved(
      { ...three, availability: blockDay(0), sessions: [sess("push", 0, { CHEST: 8 }, null, true), three.sessions[1]!, three.sessions[2]!] },
      saved3,
    );
    for (const o of proposeLayouts(input)) {
      expect(o.layout.push).toEqual(day(0));
      expect(o.moves.some((m) => m.sessionId === "push")).toBe(false);
    }
  });
});

describe("proposeLayouts, crowded one-a-day week", () => {
  // Thursday and Sunday blocked: six sessions, five free days.
  const input = withSaved({ ...six, availability: [...blockDay(3), ...blockDay(6)] }, saved6);
  const options = proposeLayouts(input);

  it("offers only skip options, never a double-up", () => {
    expect(options.length).toBeGreaterThanOrEqual(1);
    for (const o of options) {
      expect(o.overflow?.kind).toBe("skip");
      expect(o.skipped).toHaveLength(1);
      expect(o.layout[o.skipped[0]!]).toBeUndefined();
      expect(o.fit).toEqual([{ kind: "session_does_not_fit", sessionId: o.skipped[0], sessions: 6, freeDays: 5 }]);
      assertLegal({ ...input, sessions: input.sessions.filter((s) => !o.skipped.includes(s.id)) }, o.layout);
    }
  });

  it("offers a runner-up when one session overflows", () => {
    expect(options.map((o) => o.id)).toEqual(["SKIP_1", "SKIP_2"]);
    expect(options[0]!.skipped).not.toEqual(options[1]!.skipped);
  });
});

describe("proposeLayouts, crowded AM/PM week", () => {
  const halfSaved: Layout = Object.fromEntries(
    ["a", "b", "c", "d", "e", "f"].map((id, i) => [id, { day: i, daypart: "AM" as const }]),
  );
  const input = withSaved({ ...six, mode: "HALF_DAY", availability: [...blockDay(3), ...blockDay(6)] }, halfSaved);
  const options = proposeLayouts(input);

  it("leads with a double-up that keeps every session", () => {
    expect(options[0]!.id).toBe("DOUBLE_UP");
    expect(options[0]!.skipped).toEqual([]);
    expect(options[0]!.overflow?.kind).toBe("double_up");
    expect(Object.keys(options[0]!.layout)).toHaveLength(6);
    expect(options[0]!.score.facts.some((f) => f.kind === "same_day_stack")).toBe(true);
    assertLegal(input, options[0]!.layout);
  });

  it("also offers a skip", () => {
    expect(options.some((o) => o.overflow?.kind === "skip")).toBe(true);
  });
});

describe("proposeLayouts, nothing left open", () => {
  it("offers to skip every remaining session and never throws", () => {
    const all = [0, 1, 2, 3, 4, 5, 6].flatMap(blockDay);
    const input = withSaved({ ...three, availability: all }, saved3);
    const options = proposeLayouts(input);
    expect(options).toHaveLength(1);
    expect(options[0]!.skipped.sort()).toEqual(["legs", "pull", "push"]);
    expect(options[0]!.layout).toEqual({});
    expect(options[0]!.moves).toEqual([]);
  });
});

describe("nominateOverflow contract", () => {
  it("returns every candidate id exactly once, the same way each time", () => {
    const input = withSaved(six, saved6);
    const ranked = nominateOverflow(input, input.sessions);
    expect([...ranked].sort()).toEqual(["a", "b", "c", "d", "e", "f"]);
    expect(nominateOverflow(input, input.sessions)).toEqual(ranked);
  });
});

describe("proposeLayouts, crowded AM/PM edge weeks", () => {
  const cell = (d: number, daypart: "AM" | "PM") => ({ day: d, daypart });
  const movable3 = [sess("m1", 2, { CHEST: 4 }), sess("m2", 3, { BACK: 4 }), sess("m3", 4, { QUADS: 4 })];
  const halfWeek = (over: Partial<ScheduleInput>) => makeInput({ mode: "HALF_DAY", ...over });
  const blockDays = (days: number[]) => days.flatMap(blockDay);
  const blockCellsExcept = (open: string[]): AvailabilityCellInput[] =>
    [0, 1, 2, 3, 4, 5, 6]
      .flatMap((d) => (["AM", "PM"] as const).map((daypart) => ({ day: d, daypart })))
      .filter((c) => !open.includes(`${c.day}:${c.daypart}`))
      .map((c) => ({ ...c, state: "BLOCKED" as const, oneOff: true }));

  it("names a movable session and a day two kept movable sessions share, never a completed one", () => {
    const input = halfWeek({
      firstOpenDay: 1,
      availability: blockDays([3, 4, 5, 6]),
      sessions: [
        sess("done1", 0, { CHEST: 4 }, cell(0, "AM"), true),
        sess("done2", 1, { BACK: 4 }, cell(0, "PM"), true),
        ...movable3,
      ],
    });
    const dbl = proposeLayouts(input).find((o) => o.id === "DOUBLE_UP");
    expect(dbl).toBeDefined();
    expect(dbl!.skipped).toEqual([]);
    expect(dbl!.overflow?.kind).toBe("double_up");
    if (dbl!.overflow?.kind !== "double_up") return;
    const { sessionId, day: stackDay } = dbl!.overflow;
    expect(["m1", "m2", "m3"]).toContain(sessionId);
    const onDay = ["m1", "m2", "m3"].filter((id) => dbl!.layout[id]?.day === stackDay);
    expect(onDay.length).toBeGreaterThanOrEqual(2);
    expect(onDay).toContain(sessionId);
  });

  it("offers no double-up when sessions outnumber open cells", () => {
    const input = halfWeek({ availability: blockCellsExcept(["1:AM", "3:PM"]), sessions: movable3 });
    const options = proposeLayouts(input);
    expect(options.length).toBeGreaterThanOrEqual(1);
    expect(options.some((o) => o.id === "DOUBLE_UP")).toBe(false);
    for (const o of options) expect(o.overflow?.kind).toBe("skip");
    expect(options[0]!.id).toBe("SKIP_1");
  });

  it("offers to skip every movable session when every cell is blocked", () => {
    const input = halfWeek({ availability: blockDays([0, 1, 2, 3, 4, 5, 6]), sessions: movable3 });
    const options = proposeLayouts(input);
    expect(options.map((o) => o.id)).toEqual(["SKIP_1"]);
    expect([...options[0]!.skipped].sort()).toEqual(["m1", "m2", "m3"]);
  });

  it("offers no double-up when one open day cannot hold three sessions", () => {
    const input = halfWeek({ availability: blockDays([0, 1, 2, 3, 4, 6]), sessions: movable3 });
    const ids = proposeLayouts(input).map((o) => o.id);
    expect(ids).not.toContain("DOUBLE_UP");
    expect(ids).toContain("SKIP_1");
  });
});
