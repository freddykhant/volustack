import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Daypart, ScheduleMode } from "~/schema";
import {
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

function arbInput(): fc.Arbitrary<ScheduleInput> {
  return fc
    .record({
      mode: fc.constantFrom<ScheduleMode>("DAY", "HALF_DAY"),
      weekStartDay: fc.integer({ min: 0, max: 6 }),
      firstOpenDay: fc.integer({ min: 0, max: 2 }),
      footprints: fc.array(arbFootprint, { minLength: 1, maxLength: 5 }),
      availability: fc.uniqueArray(
        fc.record({
          day: fc.integer({ min: 0, max: 6 }),
          daypart: fc.constantFrom<Daypart>("AM", "PM"),
          state: fc.constantFrom<"PREFERRED" | "BLOCKED">("PREFERRED", "BLOCKED"),
        }),
        { selector: (c) => `${c.day}:${c.daypart}`, maxLength: 6 },
      ),
    })
    .map((r) => ({
      mode: r.mode,
      weekStartDay: r.weekStartDay,
      firstOpenDay: r.firstOpenDay,
      availability: r.availability,
      carryIn: [],
      sessions: r.footprints.map((footprint, i) => ({ id: `s${i}`, order: i, footprint, locked: false, placement: null })),
    }));
}

/** A legal but naive layout: sessions packed into the earliest open cells. */
function packedLayout(input: ScheduleInput): Layout | null {
  const cells = openCells(input);
  if (cells.length < input.sessions.length) return null;
  return Object.fromEntries(input.sessions.map((s, i) => [s.id, cells[i]!]));
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
        const res = placeWeek({ ...input, mode: "DAY" });
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
