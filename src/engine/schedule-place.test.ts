import { describe, expect, it } from "vitest";
import {
  applySuggestion,
  checkLayout,
  placeWeek,
  scoreLayout,
  suggestMoves,
  type Footprint,
  type Layout,
  type Placement,
} from "./schedule";
import { makeInput, sess, withSaved } from "./_fixtures/schedule";

const day = (d: number): Placement => ({ day: d, daypart: null });
const LEGS: Footprint = { QUADS: 6, GLUTES: 4 };
const PUSH: Footprint = { CHEST: 6, TRICEPS: 3 };

describe("placeWeek", () => {
  it("places every unlocked session legally", () => {
    const input = makeInput({ sessions: [sess("a", 0, LEGS), sess("b", 1, PUSH), sess("c", 2, LEGS), sess("d", 3, PUSH)] });
    const res = placeWeek(input);
    expect(res.kind).toBe("placed");
    if (res.kind !== "placed") return;
    expect(Object.keys(res.layout).sort()).toEqual(["a", "b", "c", "d"]);
    expect(checkLayout(input, res.layout)).toEqual([]);
  });

  it("separates sessions that share muscles", () => {
    const input = makeInput({ sessions: [sess("a", 0, LEGS), sess("b", 1, LEGS)] });
    const res = placeWeek(input);
    if (res.kind !== "placed") throw new Error("expected placed");
    expect(scoreLayout(input, res.layout).facts.map((f) => f.kind)).not.toContain("short_rest");
  });

  it("leaves locked sessions where they are", () => {
    const input = makeInput({ sessions: [sess("done", 0, LEGS, day(0), true), sess("a", 1, LEGS)] });
    const res = placeWeek(input);
    if (res.kind !== "placed") throw new Error("expected placed");
    expect(res.layout.done).toEqual(day(0));
  });

  it("never uses a blocked or past cell", () => {
    const input = makeInput({
      firstOpenDay: 2,
      availability: [
        { day: 3, daypart: "AM", state: "BLOCKED" },
        { day: 3, daypart: "PM", state: "BLOCKED" },
      ],
      sessions: [sess("a", 0, LEGS), sess("b", 1, PUSH), sess("c", 2, LEGS)],
    });
    const res = placeWeek(input);
    if (res.kind !== "placed") throw new Error("expected placed");
    for (const p of Object.values(res.layout)) {
      expect(p.day).toBeGreaterThanOrEqual(2);
      expect(p.day).not.toBe(3);
    }
  });

  it("uses preferred cells when nothing else distinguishes them", () => {
    const input = makeInput({
      availability: [
        { day: 4, daypart: "AM", state: "PREFERRED" },
        { day: 4, daypart: "PM", state: "PREFERRED" },
      ],
      sessions: [sess("a", 0, LEGS)],
    });
    const res = placeWeek(input);
    if (res.kind !== "placed") throw new Error("expected placed");
    expect(res.layout.a).toEqual(day(4));
  });

  // Too few open cells: report it rather than return a partial layout.
  it("reports infeasible instead of a partial layout", () => {
    const input = makeInput({ firstOpenDay: 6, sessions: [sess("a", 0, LEGS), sess("b", 1, PUSH)] });
    const res = placeWeek(input);
    expect(res).toEqual({
      kind: "infeasible",
      facts: [{ kind: "infeasible", constraint: "schedule_cells", detail: { needed: 2, open: 1 } }],
    });
  });

  it("gives a layout no suggestion can improve", () => {
    const input = makeInput({ sessions: [sess("a", 0, LEGS), sess("b", 1, PUSH), sess("c", 2, LEGS), sess("d", 3, PUSH)] });
    const res = placeWeek(input);
    if (res.kind !== "placed") throw new Error("expected placed");
    expect(suggestMoves(withSaved(input, res.layout), res.layout)).toEqual([]);
  });
});

describe("suggestMoves", () => {
  it("suggests separating back-to-back sessions that share muscles", () => {
    const layout = { a: day(0), b: day(1) };
    const input = withSaved(makeInput({ sessions: [sess("a", 0, LEGS), sess("b", 1, LEGS)] }), layout);
    const [top] = suggestMoves(input, layout);
    expect(top).toBeDefined();
    expect(top!.gain).toBeGreaterThan(0);
    expect(top!.resolves.map((f) => f.kind)).toContain("short_rest");
    const after = applySuggestion(layout, top!);
    expect(scoreLayout(input, after).cost).toBeLessThan(scoreLayout(input, layout).cost);
    expect(checkLayout(input, after)).toEqual([]);
  });

  it("stays quiet for a layout that is already good", () => {
    const layout = { a: day(0), b: day(3) };
    const input = withSaved(makeInput({ sessions: [sess("a", 0, LEGS), sess("b", 1, LEGS)] }), layout);
    expect(suggestMoves(input, layout)).toEqual([]);
  });

  it("never moves a locked session", () => {
    const layout = { done: day(0), b: day(1) };
    const input = withSaved(
      makeInput({ sessions: [sess("done", 0, LEGS, day(0), true), sess("b", 1, LEGS)] }),
      layout,
    );
    const out = suggestMoves(input, layout);
    expect(out.length).toBeGreaterThan(0);
    for (const s of out) {
      expect(s.sessionId).toBe("b");
      expect(s.swapWithSessionId).toBeNull();
    }
  });

  it("always suggests getting off a blocked cell", () => {
    const layout = { a: day(3) };
    const input = withSaved(
      makeInput({
        sessions: [sess("a", 0, LEGS)],
        availability: [
          { day: 3, daypart: "AM", state: "BLOCKED" },
          { day: 3, daypart: "PM", state: "BLOCKED" },
        ],
      }),
      layout,
    );
    const [top] = suggestMoves(input, layout);
    expect(top!.resolves.map((f) => f.kind)).toContain("on_blocked_cell");
    expect(top!.to.day).not.toBe(3);
  });

  // A full week has no empty cell, so only swaps can help.
  it("suggests a swap when every day is taken", () => {
    const footprints: Footprint[] = [LEGS, LEGS, PUSH, PUSH, { BACK: 6 }, { BACK: 6 }, { ABS: 4 }];
    const sessions = footprints.map((f, i) => sess(`s${i}`, i, f));
    const layout: Layout = Object.fromEntries(sessions.map((s, i) => [s.id, day(i)]));
    const input = withSaved(makeInput({ sessions }), layout);
    const suggestions = suggestMoves(input, layout);
    expect(suggestions.length).toBeGreaterThan(0);
    for (const s of suggestions) expect(s.swapWithSessionId).not.toBeNull();
    expect(checkLayout(input, applySuggestion(layout, suggestions[0]!))).toEqual([]);
  });

  it("returns at most three suggestions, best first", () => {
    const layout = { a: day(0), b: day(1), c: day(2) };
    const input = withSaved(
      makeInput({ sessions: [sess("a", 0, LEGS), sess("b", 1, LEGS), sess("c", 2, LEGS)] }),
      layout,
    );
    const out = suggestMoves(input, layout);
    expect(out.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < out.length; i++) expect(out[i - 1]!.gain).toBeGreaterThanOrEqual(out[i]!.gain);
  });
});

describe("suggestMoves resolves and eases", () => {
  const halfDay = (d: number, dp: "AM" | "PM"): Placement => ({ day: d, daypart: dp });

  it("lists a fully removed problem under resolves only", () => {
    const layout = { a: day(0), b: day(1) };
    const input = withSaved(makeInput({ sessions: [sess("a", 0, LEGS), sess("b", 1, LEGS)] }), layout);
    const [top] = suggestMoves(input, layout);
    expect(top).toBeDefined();
    expect(top!.resolves.map((f) => f.kind)).toContain("short_rest");
    expect(top!.eases.map((f) => f.kind)).not.toContain("short_rest");
  });

  it("lists a problem that survives with a different gap under eases, not resolves", () => {
    // Only the first two days are open, so no cell is a full rest target (4 half-days) away.
    const blocked = [2, 3, 4, 5, 6].flatMap((d) => [
      { day: d, daypart: "AM" as const, state: "BLOCKED" as const },
      { day: d, daypart: "PM" as const, state: "BLOCKED" as const },
    ]);
    const layout: Layout = { a: halfDay(0, "AM"), b: halfDay(0, "PM") };
    const input = withSaved(
      makeInput({ mode: "HALF_DAY", availability: blocked, sessions: [sess("a", 0, LEGS), sess("b", 1, LEGS)] }),
      layout,
    );
    const [top] = suggestMoves(input, layout);
    expect(top).toBeDefined();
    const before = scoreLayout(input, layout).facts.find((f) => f.kind === "short_rest");
    const after = scoreLayout(input, applySuggestion(layout, top!)).facts.find((f) => f.kind === "short_rest");
    // The same pair is still too close, only by a different margin.
    expect(after).toBeDefined();
    expect(after).not.toEqual(before);
    expect(top!.eases).toContainEqual(before);
    expect(top!.resolves).not.toContainEqual(before);
    expect(top!.resolves.map((f) => f.kind)).toContain("same_day_stack");
  });

  it("leaves a fact the move does not touch out of both lists", () => {
    const layout = { a: day(0), b: day(1), c: day(2) };
    const input = withSaved(
      makeInput({ sessions: [sess("a", 0, LEGS), sess("b", 1, LEGS), sess("c", 2, LEGS)] }),
      layout,
    );
    const base = scoreLayout(input, layout).facts;
    const suggestions = suggestMoves(input, layout);
    expect(suggestions.length).toBeGreaterThan(0);
    for (const s of suggestions) {
      const afterFacts = scoreLayout(input, applySuggestion(layout, s)).facts.map((f) => JSON.stringify(f));
      for (const f of base) {
        if (afterFacts.includes(JSON.stringify(f))) {
          expect(s.resolves).not.toContainEqual(f);
          expect(s.eases).not.toContainEqual(f);
        }
      }
    }
  });
});

describe("inert (missed) sessions", () => {
  const missed = (placement: Placement) => sess("missed", 0, LEGS, placement, true, true);

  it("placeWeek leaves a missed session where it is and may use its day", () => {
    // Only Mon (the missed session's day) is open.
    const blocked = [1, 2, 3, 4, 5, 6].flatMap((d) => [
      { day: d, daypart: "AM" as const, state: "BLOCKED" as const },
      { day: d, daypart: "PM" as const, state: "BLOCKED" as const },
    ]);
    const input = makeInput({ availability: blocked, sessions: [missed(day(0)), sess("a", 1, PUSH)] });
    const res = placeWeek(input);
    if (res.kind !== "placed") throw new Error("expected placed");
    expect(res.layout.missed).toEqual(day(0));
    expect(res.layout.a).toEqual(day(0));
    expect(checkLayout(input, res.layout)).toEqual([]);
  });

  it("does not count a missed session's cell in the infeasible tally", () => {
    const blocked = [1, 2, 3, 4, 5, 6].flatMap((d) => [
      { day: d, daypart: "AM" as const, state: "BLOCKED" as const },
      { day: d, daypart: "PM" as const, state: "BLOCKED" as const },
    ]);
    const input = makeInput({ availability: blocked, sessions: [missed(day(0)), sess("a", 1, PUSH), sess("b", 2, PUSH)] });
    expect(placeWeek(input)).toEqual({
      kind: "infeasible",
      facts: [{ kind: "infeasible", constraint: "schedule_cells", detail: { needed: 2, open: 1 } }],
    });
  });

  it("never suggests moving or swapping a missed session, and can move onto its day", () => {
    const layout = { missed: day(0), b: day(1), c: day(2) };
    const input = withSaved(
      makeInput({ sessions: [missed(day(0)), sess("b", 1, LEGS), sess("c", 2, PUSH)] }),
      layout,
    );
    const out = suggestMoves(input, layout);
    for (const s of out) {
      expect(s.sessionId).not.toBe("missed");
      expect(s.swapWithSessionId).not.toBe("missed");
    }
  });

  it("treats a missed session's day as empty, so a session can be suggested onto it", () => {
    // Days 3-6 are blocked, so Monday (where the missed session sits) is the only way to space a and b out.
    const blocked = [3, 4, 5, 6].flatMap((d) => [
      { day: d, daypart: "AM" as const, state: "BLOCKED" as const },
      { day: d, daypart: "PM" as const, state: "BLOCKED" as const },
    ]);
    const layout = { missed: day(0), a: day(1), b: day(2) };
    const input = withSaved(
      makeInput({ availability: blocked, sessions: [missed(day(0)), sess("a", 1, LEGS), sess("b", 2, LEGS)] }),
      layout,
    );
    const [top] = suggestMoves(input, layout);
    expect(top).toMatchObject({ sessionId: "a", to: day(0), swapWithSessionId: null });
    expect(top!.resolves.map((f) => f.kind)).toContain("short_rest");
    expect(checkLayout(input, applySuggestion(layout, top!))).toEqual([]);
  });
});
