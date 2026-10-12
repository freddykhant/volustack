import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Daypart, ScheduleMode } from "~/schema";
import {
  allCells,
  applySuggestion,
  cellKey,
  cellState,
  checkLayout,
  LENS_ORDER,
  openCells,
  placeWeek,
  proposeLayouts,
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
 * because history can. Some locked sessions are inert (MISSED): they share a cell with a
 * session that really trains only if the generator happens to put them there, and the
 * properties must hold either way.
 */
function arbInput(): fc.Arbitrary<ScheduleInput> {
  return fc
    .record({
      mode: fc.constantFrom<ScheduleMode>("DAY", "HALF_DAY"),
      weekStartDay: fc.integer({ min: 0, max: 6 }),
      firstOpenDay: fc.integer({ min: 0, max: 2 }),
      footprints: fc.array(arbFootprint, { minLength: 1, maxLength: 5 }),
      locks: fc.array(fc.boolean(), { minLength: 5, maxLength: 5 }),
      inerts: fc.array(fc.boolean(), { minLength: 5, maxLength: 5 }),
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
          const inert = locked && r.inerts[i]!;
          return { id: `s${i}`, order: i, footprint, locked, inert, placement: locked ? cells[i]! : null };
        }),
      })),
    );
}

/**
 * Like `arbInput()`, but some unlocked sessions also carry a saved placement on any day
 * of the week (blocked cells, past days and cells shared with another session included),
 * and extra cells are blocked so crowded weeks come up often.
 */
function arbPlacedInput(): fc.Arbitrary<ScheduleInput> {
  const arbCell = fc.record({ day: fc.integer({ min: 0, max: 6 }), daypart: fc.constantFrom<Daypart>("AM", "PM") });
  return arbInput().chain((base) =>
    fc
      .tuple(
        fc.uniqueArray(arbCell, { selector: (c) => `${c.day}:${c.daypart}`, maxLength: 14 }),
        fc.array(fc.option(arbCell, { nil: null }), { minLength: 5, maxLength: 5 }),
      )
      .map(([extra, places]) => {
        const have = new Set(base.availability.map((c) => `${c.day}:${c.daypart}`));
        const blocked = extra
          .filter((c) => !have.has(`${c.day}:${c.daypart}`))
          .map((c) => ({ ...c, state: "BLOCKED" as const }));
        return {
          ...base,
          availability: [...base.availability, ...blocked],
          sessions: base.sessions.map((s, i) => {
            const p = places[i];
            if (s.locked || !p) return s;
            return { ...s, placement: { day: p.day, daypart: base.mode === "DAY" ? null : p.daypart } };
          }),
        };
      }),
  );
}

/**
 * A legal but naive layout: locked sessions stay on their saved placements, the unlocked
 * ones are packed into the earliest open cells not taken by a locked session that happened
 * (an inert session takes no cell).
 */
function packedLayout(input: ScheduleInput): Layout | null {
  const taken = new Set(
    input.sessions.filter((s) => s.locked && !s.inert).map((s) => cellKey(s.placement!, input.mode)),
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
        const lockedDays = dayInput.sessions.filter((s) => s.locked && !s.inert).map((s) => s.placement!.day);
        fc.pre(new Set(lockedDays).size === lockedDays.length);
        const res = placeWeek(dayInput);
        if (res.kind !== "placed") return;
        const days = dayInput.sessions
          .filter((s) => !s.inert && res.layout[s.id] !== undefined)
          .map((s) => cellKey(res.layout[s.id]!, "DAY"));
        expect(new Set(days).size).toBe(days.length);
      }),
    );
  });

  it("every suggestion is legal and strictly cheaper", () => {
    fc.assert(
      fc.property(arbInput(), (raw) => {
        const layout = packedLayout(raw);
        fc.pre(layout !== null);
        const input = withSaved(raw, layout);
        const before = scoreLayout(input, layout).cost;
        for (const s of suggestMoves(input, layout)) {
          const after = applySuggestion(layout, s);
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
        const input = withSaved(raw, layout);
        const locked = new Set(input.sessions.filter((s) => s.locked).map((s) => s.id));
        for (const s of suggestMoves(input, layout)) {
          expect(locked.has(s.sessionId)).toBe(false);
          if (s.swapWithSessionId !== null) expect(locked.has(s.swapWithSessionId)).toBe(false);
        }
      }),
    );
  });

  it("an inert session changes nothing: scoring and checking ignore it", () => {
    fc.assert(
      fc.property(arbInput(), (raw) => {
        const layout = packedLayout(raw);
        fc.pre(layout !== null);
        const input = withSaved(raw, layout);
        const inertIds = new Set(input.sessions.filter((s) => s.inert).map((s) => s.id));
        fc.pre(inertIds.size > 0);
        const without: ScheduleInput = { ...input, sessions: input.sessions.filter((s) => !inertIds.has(s.id)) };
        const withoutLayout = Object.fromEntries(Object.entries(layout).filter(([id]) => !inertIds.has(id)));
        expect(scoreLayout(input, layout)).toEqual(scoreLayout(without, withoutLayout));
        expect(checkLayout(input, layout)).toEqual(checkLayout(without, withoutLayout));
      }),
    );
  });

  it("no suggestion moves or swaps an inert session", () => {
    fc.assert(
      fc.property(arbInput(), (raw) => {
        const layout = packedLayout(raw);
        fc.pre(layout !== null);
        // Drop the lock but keep the session inert: the engine must still leave it alone.
        const input = withSaved(
          { ...raw, sessions: raw.sessions.map((s) => (s.inert ? { ...s, locked: false } : s)) },
          layout,
        );
        const inert = new Set(input.sessions.filter((s) => s.inert).map((s) => s.id));
        for (const s of suggestMoves(input, layout)) {
          expect(inert.has(s.sessionId)).toBe(false);
          if (s.swapWithSessionId !== null) expect(inert.has(s.swapWithSessionId)).toBe(false);
        }
        const res = placeWeek(input);
        if (res.kind === "placed") {
          for (const s of input.sessions) if (s.inert) expect(res.layout[s.id]).toEqual(s.placement);
        }
      }),
    );
  });

  it("a suggestion's resolves and eases are disjoint facts of the current layout", () => {
    fc.assert(
      fc.property(arbInput(), (raw) => {
        const layout = packedLayout(raw);
        fc.pre(layout !== null);
        const input = withSaved(raw, layout);
        const baseFacts = scoreLayout(input, layout).facts.map((f) => JSON.stringify(f));
        for (const s of suggestMoves(input, layout)) {
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

describe("proposeLayouts properties", () => {
  it("never breaks a hard rule, never uses a blocked cell, accounts for every movable session", () => {
    fc.assert(
      fc.property(arbInput(), (input) => {
        const options = proposeLayouts(input);
        expect(options.length).toBeLessThanOrEqual(3);
        expect(new Set(options.map((o) => o.id)).size).toBe(options.length);
        for (const o of options) {
          const kept = { ...input, sessions: input.sessions.filter((s) => !o.skipped.includes(s.id)) };
          expect(checkLayout(kept, o.layout)).toEqual([]);
          for (const m of o.moves) {
            expect(cellState(input.availability, input.mode, m.to)).not.toBe("BLOCKED");
          }
          for (const s of input.sessions) {
            if (s.locked || s.inert) continue;
            expect(o.layout[s.id] !== undefined || o.skipped.includes(s.id)).toBe(true);
          }
        }
        expect(proposeLayouts(input)).toEqual(options);
      }),
    );
  });
});

describe("proposeLayouts option invariants", () => {
  it("every option is internally consistent with its id, moves and skips", () => {
    fc.assert(
      fc.property(fc.oneof(arbInput(), arbPlacedInput()), (input) => {
        const movable = new Set(input.sessions.filter((s) => !s.locked && !s.inert).map((s) => s.id));
        const byId = new Map(input.sessions.map((s) => [s.id, s]));
        const options = proposeLayouts(input);
        expect(options.length).toBeLessThanOrEqual(3);
        expect(new Set(options.map((o) => o.id)).size).toBe(options.length);
        for (const o of options) {
          const kept = { ...input, sessions: input.sessions.filter((s) => !o.skipped.includes(s.id)) };
          expect(checkLayout(kept, o.layout)).toEqual([]);

          expect(new Set(o.skipped).size).toBe(o.skipped.length);
          for (const id of o.skipped) {
            expect(movable.has(id)).toBe(true);
            expect(o.layout[id]).toBeUndefined();
          }
          for (const s of input.sessions) {
            if (s.locked || s.inert) {
              if (s.placement) expect(o.layout[s.id]).toEqual(s.placement);
            } else {
              expect(o.layout[s.id] !== undefined || o.skipped.includes(s.id)).toBe(true);
            }
          }

          const moved = new Set(o.moves.map((m) => m.sessionId));
          for (const m of o.moves) {
            expect(movable.has(m.sessionId)).toBe(true);
            expect(o.skipped).not.toContain(m.sessionId);
            expect(m.from).toEqual(byId.get(m.sessionId)!.placement);
            expect(m.to).toEqual(o.layout[m.sessionId]);
            expect(cellState(input.availability, input.mode, m.to)).not.toBe("BLOCKED");
          }

          const sharing = (day: number) =>
            input.sessions.filter((s) => !s.inert && o.layout[s.id]?.day === day).length;
          if (o.id === "DOUBLE_UP") {
            expect(o.overflow?.kind).toBe("double_up");
            expect(o.skipped).toEqual([]);
            if (o.overflow?.kind === "double_up") {
              expect(movable.has(o.overflow.sessionId)).toBe(true);
              expect(sharing(o.overflow.day)).toBeGreaterThanOrEqual(2);
            }
          } else if (o.id.startsWith("SKIP_")) {
            expect(o.overflow?.kind).toBe("skip");
            if (o.overflow?.kind === "skip") expect(o.overflow.sessionId).toBe(o.skipped[0]);
          } else {
            expect(LENS_ORDER as readonly string[]).toContain(o.id);
            expect(o.overflow).toBeNull();
            expect(o.skipped).toEqual([]);
            expect(o.moves.length).toBeGreaterThan(0);
          }

          if (input.mode === "DAY") {
            const live = input.sessions.filter((s) => !s.inert && o.layout[s.id] !== undefined);
            for (let i = 0; i < live.length; i++) {
              for (let j = i + 1; j < live.length; j++) {
                const a = live[i]!;
                const b = live[j]!;
                if (o.layout[a.id]!.day !== o.layout[b.id]!.day) continue;
                expect(moved.has(a.id) || moved.has(b.id)).toBe(false);
              }
            }
          }
        }
        expect(proposeLayouts(input)).toEqual(options);
      }),
      { numRuns: 500 },
    );
  });
});
