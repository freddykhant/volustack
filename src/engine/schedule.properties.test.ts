import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Daypart, ScheduleMode } from "~/schema";
import {
  allCells,
  applySuggestion,
  cellKey,
  checkLayout,
  openCells,
  placeWeek,
  scoreLayout,
  suggestMoves,
  type Footprint,
  type Layout,
  type ScheduleInput,
} from "./schedule";
import { withSaved } from "./_fixtures/schedule";
import { ALL_MUSCLES } from "./util";

const arbFootprint = fc.dictionary(fc.constantFrom(...ALL_MUSCLES), fc.integer({ min: 1, max: 8 }), {
  maxKeys: 5,
}) as fc.Arbitrary<Footprint>;

/**
 * Sessions may be locked (COMPLETED or MISSED), each with a saved placement on a distinct
 * cell legal for the mode. Locked sessions can sit anywhere, blocked or past cells included,
 * because history can.
 */
function arbInput(): fc.Arbitrary<ScheduleInput> {
  return fc
    .record({
      mode: fc.constantFrom<ScheduleMode>("DAY", "HALF_DAY"),
      weekStartDay: fc.integer({ min: 0, max: 6 }),
      firstOpenDay: fc.integer({ min: 0, max: 2 }),
      footprints: fc.array(arbFootprint, { minLength: 1, maxLength: 5 }),
      locks: fc.array(fc.boolean(), { minLength: 5, maxLength: 5 }),
      availability: fc.uniqueArray(
        fc.record({
          day: fc.integer({ min: 0, max: 6 }),
          daypart: fc.constantFrom<Daypart>("AM", "PM"),
          state: fc.constantFrom<"PREFERRED" | "BLOCKED">("PREFERRED", "BLOCKED"),
        }),
        { selector: (c) => `${c.day}:${c.daypart}`, maxLength: 6 },
      ),
    })
    .chain((r) =>
      fc.shuffledSubarray(allCells(r.mode), { minLength: 5, maxLength: 5 }).map((cells) => ({
        mode: r.mode,
        weekStartDay: r.weekStartDay,
        firstOpenDay: r.firstOpenDay,
        availability: r.availability,
        carryIn: [],
        sessions: r.footprints.map((footprint, i) => {
          const locked = r.locks[i]!;
          return { id: `s${i}`, order: i, footprint, locked, placement: locked ? cells[i]! : null };
        }),
      })),
    );
}

/**
 * A legal but naive layout: locked sessions stay on their saved placements, the unlocked
 * ones are packed into the earliest open cells not taken by a locked session.
 */
function packedLayout(input: ScheduleInput): Layout | null {
  const taken = new Set(
    input.sessions.filter((s) => s.locked).map((s) => cellKey(s.placement!, input.mode)),
  );
  const free = openCells(input).filter((c) => !taken.has(cellKey(c, input.mode)));
  const unlocked = input.sessions.filter((s) => !s.locked);
  if (free.length < unlocked.length) return null;
  const layout: Layout = {};
  for (const s of input.sessions) if (s.locked) layout[s.id] = s.placement!;
  unlocked.forEach((s, i) => {
    layout[s.id] = free[i]!;
  });
  return layout;
}

describe("schedule properties", () => {
  it("placeWeek never breaks a hard rule", () => {
    fc.assert(
      fc.property(arbInput(), (input) => {
        const res = placeWeek(input);
        if (res.kind !== "placed") return;
        expect(checkLayout(input, res.layout)).toEqual([]);
        expect(Object.keys(res.layout)).toHaveLength(input.sessions.length);
      }),
    );
  });

  it("placeWeek is deterministic", () => {
    fc.assert(
      fc.property(arbInput(), (input) => {
        expect(placeWeek(input)).toEqual(placeWeek(structuredClone(input)));
      }),
    );
  });

  it("a freshly placed week yields no suggestion", () => {
    fc.assert(
      fc.property(arbInput(), (input) => {
        const res = placeWeek(input);
        if (res.kind !== "placed") return;
        expect(suggestMoves(withSaved(input, res.layout), res.layout)).toEqual([]);
      }),
    );
  });

  it("DAY mode never puts two sessions on one day", () => {
    fc.assert(
      fc.property(arbInput(), (input) => {
        // Re-read the input as DAY mode: locked history keeps its day, minus the daypart. Skip
        // when two locked sessions then share a day (that history is not a legal DAY layout).
        const dayInput: ScheduleInput = {
          ...input,
          mode: "DAY",
          sessions: input.sessions.map((s) =>
            s.locked ? { ...s, placement: { day: s.placement!.day, daypart: null } } : s,
          ),
        };
        const lockedDays = dayInput.sessions.filter((s) => s.locked).map((s) => s.placement!.day);
        fc.pre(new Set(lockedDays).size === lockedDays.length);
        const res = placeWeek(dayInput);
        if (res.kind !== "placed") return;
        const days = Object.values(res.layout).map((p) => cellKey(p, "DAY"));
        expect(new Set(days).size).toBe(days.length);
      }),
    );
  });

  it("every suggestion is legal and strictly cheaper", () => {
    fc.assert(
      fc.property(arbInput(), (raw) => {
        const layout = packedLayout(raw);
        fc.pre(layout !== null);
        const input = withSaved(raw, layout!);
        const before = scoreLayout(input, layout!).cost;
        for (const s of suggestMoves(input, layout!)) {
          const after = applySuggestion(layout!, s);
          expect(checkLayout(input, after)).toEqual([]);
          expect(scoreLayout(input, after).cost).toBeLessThan(before);
        }
      }),
    );
  });

  it("placeWeek keeps every locked session exactly where it was saved", () => {
    fc.assert(
      fc.property(arbInput(), (input) => {
        const res = placeWeek(input);
        if (res.kind !== "placed") return;
        for (const s of input.sessions) {
          if (s.locked) expect(res.layout[s.id]).toEqual(s.placement);
        }
      }),
    );
  });

  it("no suggestion moves or swaps a locked session", () => {
    fc.assert(
      fc.property(arbInput(), (raw) => {
        const layout = packedLayout(raw);
        fc.pre(layout !== null);
        const input = withSaved(raw, layout!);
        const locked = new Set(input.sessions.filter((s) => s.locked).map((s) => s.id));
        for (const s of suggestMoves(input, layout!)) {
          expect(locked.has(s.sessionId)).toBe(false);
          if (s.swapWithSessionId !== null) expect(locked.has(s.swapWithSessionId)).toBe(false);
        }
      }),
    );
  });

  it("a suggestion's resolves and eases are disjoint facts of the current layout", () => {
    fc.assert(
      fc.property(arbInput(), (raw) => {
        const layout = packedLayout(raw);
        fc.pre(layout !== null);
        const input = withSaved(raw, layout!);
        const baseFacts = scoreLayout(input, layout!).facts.map((f) => JSON.stringify(f));
        for (const s of suggestMoves(input, layout!)) {
          const resolves = s.resolves.map((f) => JSON.stringify(f));
          const eases = s.eases.map((f) => JSON.stringify(f));
          for (const f of resolves) expect(eases).not.toContain(f);
          for (const f of [...resolves, ...eases]) expect(baseFacts).toContain(f);
        }
      }),
    );
  });

  it("LAW 1: no function changes a footprint or a saved placement", () => {
    fc.assert(
      fc.property(arbInput(), (input) => {
        const snapshot = structuredClone(input);
        const res = placeWeek(input);
        if (res.kind === "placed") {
          scoreLayout(input, res.layout);
          suggestMoves(input, res.layout);
          checkLayout(input, res.layout);
        }
        expect(input).toEqual(snapshot);
      }),
    );
  });
});
