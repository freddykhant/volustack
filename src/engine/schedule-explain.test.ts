import { describe, expect, it } from "vitest";
import { makeInput, sess, withSaved } from "./_fixtures/schedule";
import { SUGGESTION_MIN_GAIN } from "./constants";
import { checkLayout, explainPlacement, scoreLayout, suggestMoves, type Layout } from "./schedule";

const day = (d: number) => ({ day: d, daypart: null });
const half = (d: number, dp: "AM" | "PM") => ({ day: d, daypart: dp });
const blockedDay = (d: number, extra: { oneOff?: boolean } = {}) => [
  { day: d, daypart: "AM" as const, state: "BLOCKED" as const, ...extra },
  { day: d, daypart: "PM" as const, state: "BLOCKED" as const, ...extra },
];

// Mon push, Wed legs A, Fri legs B. The two leg days share quads.
const base = makeInput({
  sessions: [sess("push", 0, { CHEST: 8 }), sess("legsA", 1, { QUADS: 8 }), sess("legsB", 2, { QUADS: 8 })],
});
const saved: Layout = { push: day(0), legsA: day(2), legsB: day(4) };
const input = withSaved(base, saved);

describe("explainPlacement", () => {
  it("compares the nearest free day before and after", () => {
    const ex = explainPlacement(input, saved, "legsB")!;
    expect(ex.current).toEqual(day(4));
    expect(ex.alternatives.map((a) => a.to)).toEqual([day(3), day(5)]);
  });

  it("reports the problem an earlier day would create", () => {
    const ex = explainPlacement(input, saved, "legsB")!;
    const thursday = ex.alternatives[0]!;
    expect(thursday.delta).toBeGreaterThan(0);
    expect(thursday.adds.some((f) => f.kind === "short_rest" && [f.sessionId, f.otherSessionId].includes("legsA"))).toBe(true);
  });

  it("gives each alternative's cost change exactly", () => {
    const ex = explainPlacement(input, saved, "legsB")!;
    for (const a of ex.alternatives) {
      const moved = scoreLayout(input, { ...saved, legsB: a.to }).cost;
      expect(a.delta).toBeCloseTo(moved - scoreLayout(input, saved).cost, 6);
    }
  });

  it("says the placement is the best when no single move lowers the cost", () => {
    const ex = explainPlacement(input, saved, "legsB")!;
    expect(ex.isBest).toBe(true);
    expect(ex.better).toBeNull();
  });

  it("names the better cell when there is one", () => {
    const crowded: Layout = { ...saved, legsB: day(3) };
    const ex = explainPlacement(withSaved(base, crowded), crowded, "legsB")!;
    expect(ex.isBest).toBe(false);
    expect(ex.better).not.toBeNull();
    expect(ex.currentFacts.some((f) => f.kind === "short_rest")).toBe(true);
    const improved = scoreLayout(withSaved(base, crowded), { ...crowded, legsB: ex.better!.to }).cost;
    expect(improved).toBeLessThan(scoreLayout(withSaved(base, crowded), crowded).cost);
    expect(ex.better!.delta).toBeCloseTo(improved - scoreLayout(withSaved(base, crowded), crowded).cost, 6);
  });

  it("lists only facts that name the session as its current facts", () => {
    const crowded: Layout = { ...saved, legsB: day(3) };
    const ex = explainPlacement(withSaved(base, crowded), crowded, "legsA")!;
    expect(ex.currentFacts.length).toBeGreaterThan(0);
    expect(ex.currentFacts.every((f) => JSON.stringify(f).includes("legsA"))).toBe(true);
  });

  it("hands back its own copy of the current placement", () => {
    const ex = explainPlacement(input, saved, "legsB")!;
    expect(ex.current).toEqual(saved.legsB);
    expect(ex.current).not.toBe(saved.legsB);
  });

  it("reports a rest gap that shrinks across the week boundary as a changed fact", () => {
    const carried = withSaved(
      makeInput({
        sessions: [sess("tue", 0, { QUADS: 8 })],
        carryIn: [{ footprint: { QUADS: 8 }, halfDaysBeforeWeekStart: 1 }],
      }),
      { tue: day(1) },
    );
    const ex = explainPlacement(carried, { tue: day(1) }, "tue")!;
    const monday = ex.alternatives.find((a) => a.to.day === 0)!;
    expect(monday.delta).toBeGreaterThan(0);
    expect(monday.adds).toEqual([]);
    expect(monday.changes).toHaveLength(1);
    const fact = monday.changes[0]!;
    expect(fact.kind).toBe("short_rest");
    // Monday sits one half-day after the carried-in session.
    expect(fact.kind === "short_rest" && fact.gapHalfDays).toBe(1);
    const wednesday = ex.alternatives.find((a) => a.to.day === 2)!;
    expect(wednesday.resolves.some((f) => f.kind === "short_rest")).toBe(true);
  });

  it("offers nothing as better when the gain is within the suggestion bar", () => {
    // Two unrelated sessions on Mon and Wed: the only cost is spread (3). Thursday brings it to 1.
    const lay: Layout = { a: day(0), b: day(2) };
    const week = withSaved(makeInput({ sessions: [sess("a", 0, { CHEST: 8 }), sess("b", 1, { BICEPS: 8 })] }), lay);
    const cost = scoreLayout(week, lay).cost;
    const best = scoreLayout(week, { ...lay, b: day(3) }).cost;
    expect(cost - best).toBeGreaterThan(0);
    expect(cost - best).toBeLessThanOrEqual(SUGGESTION_MIN_GAIN);
    const ex = explainPlacement(week, lay, "b")!;
    expect(ex.better).toBeNull();
    expect(ex.isBest).toBe(true);
    const thursday = ex.alternatives.find((a) => a.to.day === 3)!;
    expect(thursday.delta).toBeLessThan(0);
    expect(thursday.adds).toEqual([]);
    expect(thursday.changes).toEqual([]);
    // The 5-day and 2-day gaps are far enough apart to be a fact; Thursday's 3 and 4 are not.
    expect(thursday.resolves.map((f) => f.kind)).toEqual(["uneven_spread"]);
  });

  it("flags a session that takes part in a board suggestion, as the mover or the swap partner", () => {
    // Quads on Monday right after a carried-in quads session; chest on Wednesday. Only Monday and
    // Wednesday are open, so the one fix is to trade them.
    const lay: Layout = { quads: day(0), chest: day(2) };
    const week = withSaved(
      makeInput({
        sessions: [sess("quads", 0, { QUADS: 8 }), sess("chest", 1, { CHEST: 8 })],
        carryIn: [{ footprint: { QUADS: 8 }, halfDaysBeforeWeekStart: 1 }],
        availability: [1, 3, 4, 5, 6].flatMap((d) => blockedDay(d)),
      }),
      lay,
    );
    const swap = suggestMoves(week, lay).find((m) => m.swapWithSessionId !== null);
    expect(swap).toBeDefined();
    expect(explainPlacement(week, lay, swap!.sessionId)!.inSuggestion).toBe(true);
    expect(explainPlacement(week, lay, swap!.swapWithSessionId!)!.inSuggestion).toBe(true);
  });

  it("does not flag a session that no suggestion touches", () => {
    expect(suggestMoves(input, saved)).toEqual([]);
    expect(explainPlacement(input, saved, "legsB")!.inSuggestion).toBe(false);
    const crowded: Layout = { ...saved, legsB: day(3) };
    const week = withSaved(base, crowded);
    expect(suggestMoves(week, crowded).some((m) => m.sessionId === "push" || m.swapWithSessionId === "push")).toBe(false);
    expect(explainPlacement(week, crowded, "push")!.inSuggestion).toBe(false);
    expect(explainPlacement(week, crowded, "legsB")!.inSuggestion).toBe(true);
  });

  it("does not credit a move with another session's preference change", () => {
    // Saturday is the only Preferred day and is open. Moving "a" onto it fills it, which also
    // ends "b"'s off-preference fact; that fact is about "b" alone.
    const lay: Layout = { a: day(4), b: day(0) };
    const week = withSaved(
      makeInput({
        sessions: [sess("a", 0, { CHEST: 8 }), sess("b", 1, { BICEPS: 8 })],
        availability: [
          { day: 5, daypart: "AM", state: "PREFERRED" },
          { day: 5, daypart: "PM", state: "PREFERRED" },
        ],
      }),
      lay,
    );
    const before = scoreLayout(week, lay).facts;
    expect(before.some((f) => f.kind === "off_preference" && f.sessionId === "b")).toBe(true);
    const ex = explainPlacement(week, lay, "a")!;
    const saturday = ex.alternatives.find((x) => x.to.day === 5)!;
    expect(saturday).toBeDefined();
    expect(saturday.resolves.some((f) => f.kind === "off_preference" && f.sessionId === "a")).toBe(true);
    for (const f of [...saturday.adds, ...saturday.changes, ...saturday.resolves]) {
      expect(JSON.stringify(f).includes('"a"') || f.kind === "load_streak" || f.kind === "uneven_spread").toBe(true);
    }
    expect(ex.currentFacts.every((f) => f.kind === "off_preference" && f.sessionId === "a")).toBe(true);
  });

  it("offers legal half-day moves, including the other half of its own day and a stacked day", () => {
    const lay: Layout = { w: half(0, "AM"), x: half(2, "PM"), z: half(3, "AM") };
    const week = withSaved(
      makeInput({
        mode: "HALF_DAY",
        sessions: [sess("w", 0, { CHEST: 8 }), sess("x", 1, { BICEPS: 8 }), sess("z", 2, { QUADS: 8 })],
      }),
      lay,
    );
    const ex = explainPlacement(week, lay, "x")!;
    expect(ex.alternatives.map((a) => a.to)).toEqual([half(2, "AM"), half(3, "PM")]);
    for (const a of ex.alternatives) {
      expect(checkLayout(week, { ...lay, x: a.to })).toEqual([]);
    }
    const stacked = ex.alternatives.find((a) => a.to.day === 3)!;
    expect(stacked.adds.some((f) => f.kind === "same_day_stack" && f.sessionIds.includes("x"))).toBe(true);
    expect(ex.alternatives[0]!.adds.some((f) => f.kind === "same_day_stack")).toBe(false);
  });

  it("explains a session standing on a blocked cell", () => {
    const lay: Layout = { push: day(0), legsA: day(2), legsB: day(4) };
    const week = withSaved({ ...base, availability: blockedDay(4) }, lay);
    const ex = explainPlacement(week, lay, "legsB")!;
    expect(ex.currentFacts.some((f) => f.kind === "on_blocked_cell")).toBe(true);
    expect(ex.better).not.toBeNull();
    expect(ex.isBest).toBe(false);
    expect(ex.better!.resolves.some((f) => f.kind === "on_blocked_cell")).toBe(true);
  });

  it("has no alternatives when nothing else is open", () => {
    const blocked = [1, 3, 5, 6].flatMap((d) => [
      { day: d, daypart: "AM" as const, state: "BLOCKED" as const },
      { day: d, daypart: "PM" as const, state: "BLOCKED" as const },
    ]);
    const tight = withSaved({ ...base, availability: blocked }, saved);
    const ex = explainPlacement(tight, saved, "legsB")!;
    expect(ex.alternatives).toEqual([]);
    expect(ex.isBest).toBe(true);
  });

  it("never offers a past day or an occupied cell", () => {
    const later = withSaved({ ...base, firstOpenDay: 4 }, saved);
    const ex = explainPlacement(later, saved, "legsB")!;
    expect(ex.alternatives.map((a) => a.to)).toEqual([day(5)]);
  });

  it("returns null for a completed session, an unplaced session and an unknown id", () => {
    const done = withSaved(
      { ...base, sessions: [sess("push", 0, { CHEST: 8 }, null, true), base.sessions[1]!, base.sessions[2]!] },
      saved,
    );
    expect(explainPlacement(done, saved, "push")).toBeNull();
    expect(explainPlacement(input, { push: day(0), legsA: day(2) }, "legsB")).toBeNull();
    expect(explainPlacement(input, saved, "nope")).toBeNull();
  });

  it("is deterministic and does not change its inputs", () => {
    const before = JSON.stringify([input, saved]);
    expect(explainPlacement(input, saved, "legsB")).toEqual(explainPlacement(input, saved, "legsB"));
    expect(JSON.stringify([input, saved])).toBe(before);
  });
});
