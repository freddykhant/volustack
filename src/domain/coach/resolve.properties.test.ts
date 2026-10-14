import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { CoachIntentForm, ExceptionInput } from "~/schema";
import { CoachIntentEnum } from "~/schema";
import type { CoachFinalReply, CoachReply } from "~/views/coach";
import { resolveCoachForm, type BlockSource, type CoachDate, type CoachWeek } from "./resolve";

const iso = (n: number) => new Date(Date.UTC(2026, 9, 1 + n)).toISOString().slice(0, 10);
const arbSource = fc.constantFrom<BlockSource>(null, null, "standing", "one_off");
const arbDaypart = fc.constantFrom<"AM" | "PM" | null>("AM", "PM", null);

const arbWeek: fc.Arbitrary<CoachWeek> = fc
  .record({
    mode: fc.constantFrom<"DAY" | "HALF_DAY">("DAY", "HALF_DAY"),
    start: fc.integer({ min: 0, max: 20 }),
    length: fc.integer({ min: 0, max: 21 }),
    weekIndex: fc.integer({ min: 1, max: 3 }),
    blocks: fc.array(fc.tuple(arbSource, arbSource), { minLength: 21, maxLength: 21 }),
    sessions: fc.array(
      fc.record({
        status: fc.constantFrom<"SCHEDULED" | "COMPLETED" | "MISSED">("SCHEDULED", "SCHEDULED", "COMPLETED", "MISSED"),
        day: fc.option(fc.integer({ min: 0, max: 6 }), { nil: null }),
        half: fc.constantFrom<"AM" | "PM">("AM", "PM"),
      }),
      { maxLength: 6 },
    ),
    stranded: fc.boolean(),
    suggestion: fc.option(
      fc.record({ headline: fc.constant("Move Session 1 to another day."), reasons: fc.array(fc.constant("A reason."), { maxLength: 2 }) }),
      { nil: null },
    ),
    warnings: fc.array(fc.constant("A warning."), { maxLength: 2 }),
    explains: fc.boolean(),
  })
  .map(({ mode, start, length, blocks, sessions, stranded, weekIndex, suggestion, warnings, explains }) => {
    const dates: CoachDate[] = Array.from({ length }, (_, i) => ({
      date: iso(start + i),
      weekday: (start + i + 3) % 7,
      weekIndex: Math.floor(i / 7) + 1,
      am: blocks[i]![0],
      pm: blocks[i]![1],
    }));
    return {
      mode,
      weekIndex,
      dates,
      sessions: sessions.map((s, i) => ({
        key: `S${i + 1}`,
        id: `id-${i + 1}`,
        label: `Session ${i + 1}`,
        status: s.status,
        placement: s.day === null ? null : { day: s.day, daypart: mode === "DAY" ? null : s.half },
      })),
      stranded,
      warnings,
      suggestion,
      next: null,
      readiness: null,
      explain: (sessionId: string) =>
        explains ? { sessionId, current: { day: 0, daypart: null }, currentFacts: [], alternatives: [], better: null, isBest: true, inSuggestion: false } : null,
    };
  });

const arbForm: fc.Arbitrary<CoachIntentForm> = fc.record({
  intent: fc.constantFrom(...CoachIntentEnum.options),
  dates: fc.array(fc.record({ date: fc.integer({ min: -5, max: 50 }).map(iso), daypart: arbDaypart }), { maxLength: 14 }),
  sessionKey: fc.option(fc.integer({ min: 1, max: 9 }).map((n) => `S${n}`), { nil: null }),
});

function finals(reply: CoachReply): CoachFinalReply[] {
  return reply.kind === "clarify" ? reply.choices.map((c) => c.reply) : [reply];
}

function checkCells(cells: ExceptionInput[], week: CoachWeek, wantBlocked: boolean) {
  const byDate = new Map(week.dates.map((d) => [d.date, d]));
  expect(new Set(cells.map((c) => `${c.date}:${c.daypart ?? "-"}`)).size).toBe(cells.length);
  for (const c of cells) {
    const d = byDate.get(c.date);
    expect(d).toBeDefined();
    if (week.mode === "DAY") expect(c.daypart).toBeNull();
    const halves = c.daypart === null ? [d!.am, d!.pm] : [c.daypart === "AM" ? d!.am : d!.pm];
    if (wantBlocked) {
      // Only one-off time is ever offered for unblocking.
      if (week.mode === "HALF_DAY") expect(halves.every((h) => h === "one_off")).toBe(true);
      else {
        // A day is blocked only when both halves are, and it is offered only if some of that is one-off.
        expect(halves.every((h) => h !== null)).toBe(true);
        expect(halves.some((h) => h === "one_off")).toBe(true);
      }
    } else if (week.mode === "HALF_DAY") {
      // A half that is already blocked is never offered for blocking.
      expect(halves.every((h) => h === null)).toBe(true);
    } else {
      expect(halves.some((h) => h === null)).toBe(true);
    }
  }
}

describe("resolveCoachForm properties", () => {
  it("never throws, never nests a clarify, and never offers a cell or session outside the week", () => {
    fc.assert(
      fc.property(arbForm, arbWeek, (form, week) => {
        const reply = resolveCoachForm(form, week);
        if (reply.kind === "clarify") {
          expect(reply.question.length).toBeGreaterThan(0);
          expect(reply.choices.length).toBeGreaterThan(0);
          expect(reply.choices.every((c) => c.label.length > 0)).toBe(true);
          expect(reply.choices.every((c) => (c.reply as { kind: string }).kind !== "clarify")).toBe(true);
        }
        for (const r of finals(reply)) {
          if (r.kind === "confirm_block") {
            expect(r.cells.length).toBeGreaterThan(0);
            expect(r.cells.length).toBeLessThanOrEqual(14);
            expect(r.summary.length).toBeGreaterThan(0);
            checkCells(r.cells, week, false);
          }
          if (r.kind === "confirm_unblock") {
            expect(r.cells.length).toBeGreaterThan(0);
            expect(r.cells.length).toBeLessThanOrEqual(14);
            expect(r.summary.length).toBeGreaterThan(0);
            checkCells(r.cells, week, true);
          }
          if (r.kind === "skip") {
            expect(r.summary.length).toBeGreaterThan(0);
            const s = week.sessions.find((x) => x.id === r.sessionId);
            expect(s?.status).toBe("SCHEDULED");
          }
          if ("lines" in r) expect(r.lines.length).toBeGreaterThan(0);
          for (const line of "lines" in r ? r.lines : []) expect(line.length).toBeGreaterThan(0);
        }
        expect(resolveCoachForm(form, week)).toEqual(reply);
      }),
      { numRuns: 2000 },
    );
  });
});
