import { describe, expect, it } from "vitest";
import type { DecisionFact } from "~/engine";
import { makeInput, sess, withSaved } from "~/engine/_fixtures/schedule";
import { proposeLayouts } from "~/engine/schedule";
import {
  moveLine,
  phraseScheduleFact,
  placementLabel,
  toMoveSuggestionView,
  toReplacementOptionView,
  toScheduleWeekView,
  toWarnings,
} from "./schedule";

const label = (id: string) => ({ a: "Upper A", b: "Lower A" })[id] ?? "Session";

describe("placementLabel", () => {
  it("names the day, and the half when there is one", () => {
    expect(placementLabel({ day: 1, daypart: null })).toBe("Tue");
    expect(placementLabel({ day: 1, daypart: "PM" })).toBe("Tue PM");
  });
});

describe("phraseScheduleFact", () => {
  it("phrases short rest between two sessions in whole days", () => {
    const fact: DecisionFact = { kind: "short_rest", sessionId: "b", otherSessionId: "a", muscle: "QUADS", gapHalfDays: 2, targetHalfDays: 4 };
    expect(phraseScheduleFact(fact, label)).toBe("Lower A is only 1 day after Upper A, and both train quads.");
  });

  it("phrases odd gaps in half-days", () => {
    const fact: DecisionFact = { kind: "short_rest", sessionId: "b", otherSessionId: "a", muscle: "SIDE_DELTS", gapHalfDays: 3, targetHalfDays: 4 };
    expect(phraseScheduleFact(fact, label)).toBe("Lower A is only 3 half-days after Upper A, and both train side delts.");
  });

  it("phrases short rest against last week", () => {
    const fact: DecisionFact = { kind: "short_rest", sessionId: "a", otherSessionId: null, muscle: "CHEST", gapHalfDays: 2, targetHalfDays: 4 };
    expect(phraseScheduleFact(fact, label)).toBe("Upper A is only 1 day after last week's chest work.");
  });

  it("phrases the remaining schedule facts", () => {
    expect(phraseScheduleFact({ kind: "load_streak", days: 5, limit: 3 }, label)).toBe("5 training days in a row.");
    expect(phraseScheduleFact({ kind: "same_day_stack", day: 2, sessionIds: ["a", "b"], sharedSets: 0 }, label)).toBe(
      "Upper A and Lower A are both on Wed.",
    );
    expect(phraseScheduleFact({ kind: "off_preference", sessionId: "a" }, label)).toBe(
      "Upper A isn't in one of your preferred times.",
    );
    expect(phraseScheduleFact({ kind: "uneven_spread", longestGapDays: 5, shortestGapDays: 1 }, label)).toBe(
      "Sessions are bunched together, leaving a 5-day gap.",
    );
    expect(phraseScheduleFact({ kind: "on_blocked_cell", sessionId: "a", day: 3, daypart: "AM" }, label)).toBe(
      "Upper A is on Thu AM, which you've blocked.",
    );
  });

  it("returns null for facts that are not about scheduling", () => {
    expect(phraseScheduleFact({ kind: "deload_scheduled", atWeek: 6 }, label)).toBeNull();
  });
});

describe("toWarnings", () => {
  it("keeps only schedule facts, in order", () => {
    const facts: DecisionFact[] = [
      { kind: "deload_scheduled", atWeek: 6 },
      { kind: "load_streak", days: 4, limit: 3 },
    ];
    expect(toWarnings(facts, label)).toEqual(["4 training days in a row."]);
  });
});

describe("toMoveSuggestionView", () => {
  it("describes a move", () => {
    const view = toMoveSuggestionView(
      {
        sessionId: "b",
        from: { day: 1, daypart: null },
        to: { day: 3, daypart: null },
        swapWithSessionId: null,
        gain: 12,
        resolves: [{ kind: "short_rest", sessionId: "b", otherSessionId: "a", muscle: "QUADS", gapHalfDays: 2, targetHalfDays: 4 }],
        eases: [],
      },
      label,
    );
    expect(view.headline).toBe("Move Lower A from Tue to Thu.");
    expect(view.reasons).toEqual(["Lower A is only 1 day after Upper A, and both train quads."]);
  });

  it("describes a swap", () => {
    const view = toMoveSuggestionView(
      { sessionId: "a", from: { day: 0, daypart: null }, to: { day: 1, daypart: null }, swapWithSessionId: "b", gain: 5, resolves: [], eases: [] },
      label,
    );
    expect(view.headline).toBe("Swap Upper A (Mon) with Lower A (Tue).");
  });

  it("gives a reason for every fact the move resolves or eases, resolves first", () => {
    const view = toMoveSuggestionView(
      {
        sessionId: "b",
        from: { day: 1, daypart: null },
        to: { day: 3, daypart: null },
        swapWithSessionId: null,
        gain: 8,
        resolves: [{ kind: "load_streak", days: 4, limit: 3 }],
        eases: [{ kind: "short_rest", sessionId: "b", otherSessionId: "a", muscle: "QUADS", gapHalfDays: 2, targetHalfDays: 4 }],
      },
      label,
    );
    expect(view.reasons).toEqual([
      "4 training days in a row.",
      "Lower A is only 1 day after Upper A, and both train quads.",
    ]);
  });
});

describe("toScheduleWeekView", () => {
  it("derives the saved layout, locks and warnings from the input", () => {
    const view = toScheduleWeekView({
      weekIndex: 1,
      readOnly: false,
      mode: "DAY",
      timezone: "UTC",
      days: [],
      sessions: [
        { id: "a", label: "Upper A", estimatedMinutes: 60, status: "COMPLETED" },
        { id: "b", label: "Lower A", estimatedMinutes: 50, status: "SCHEDULED" },
      ],
      input: {
        mode: "DAY",
        weekStartDay: 0,
        firstOpenDay: 0,
        availability: [],
        carryIn: [],
        sessions: [
          { id: "a", order: 0, footprint: { QUADS: 6 }, locked: true, inert: false, placement: { day: 0, daypart: null } },
          { id: "b", order: 1, footprint: { QUADS: 6 }, locked: false, inert: false, placement: { day: 1, daypart: null } },
        ],
      },
    });
    expect(view.layout).toEqual({ a: { day: 0, daypart: null }, b: { day: 1, daypart: null } });
    expect(view.sessions.map((s) => s.locked)).toEqual([true, false]);
    expect(view.warnings).toContain("Lower A is only 1 day after Upper A, and both train quads.");
  });

  it("shows no warnings for a finished week: nobody can act on them", () => {
    const view = toScheduleWeekView({
      weekIndex: 1,
      readOnly: true,
      mode: "DAY",
      timezone: "UTC",
      days: [],
      sessions: [
        { id: "a", label: "Upper A", estimatedMinutes: 60, status: "COMPLETED" },
        { id: "b", label: "Lower A", estimatedMinutes: 50, status: "COMPLETED" },
      ],
      input: {
        mode: "DAY",
        weekStartDay: 0,
        firstOpenDay: 7,
        availability: [],
        carryIn: [],
        sessions: [
          { id: "a", order: 0, footprint: { QUADS: 6 }, locked: true, inert: false, placement: { day: 0, daypart: null } },
          { id: "b", order: 1, footprint: { QUADS: 6 }, locked: true, inert: false, placement: { day: 1, daypart: null } },
        ],
      },
    });
    expect(view.readOnly).toBe(true);
    expect(view.warnings).toEqual([]);
    // The layout itself is still shown.
    expect(view.layout).toEqual({ a: { day: 0, daypart: null }, b: { day: 1, daypart: null } });
  });
});

describe("replacement option views", () => {
  const day = (d: number) => ({ day: d, daypart: null });
  const name = (id: string) => ({ a: "Push", b: "Pull", c: "Legs", d: "Upper", e: "Lower", f: "Arms" })[id] ?? "Session";
  const blockDay = (d: number) => [
    { day: d, daypart: "AM" as const, state: "BLOCKED" as const, oneOff: true },
    { day: d, daypart: "PM" as const, state: "BLOCKED" as const, oneOff: true },
  ];

  it("phrases a move", () => {
    expect(moveLine({ sessionId: "c", from: day(3), to: { day: 5, daypart: "AM" } }, name)).toBe("Legs: Thu → Sat AM");
    expect(moveLine({ sessionId: "c", from: null, to: day(5) }, name)).toBe("Legs: not placed → Sat");
  });

  it("phrases the does-not-fit fact", () => {
    expect(phraseScheduleFact({ kind: "session_does_not_fit", sessionId: "f", sessions: 6, freeDays: 5 }, name)).toBe(
      "6 sessions are left this week and only 5 days are open.",
    );
    expect(phraseScheduleFact({ kind: "session_does_not_fit", sessionId: "f", sessions: 2, freeDays: 1 }, name)).toBe(
      "2 sessions are left this week and only 1 day is open.",
    );
  });

  it("titles lens options and lists only changed placements", () => {
    const input = withSaved(
      makeInput({ sessions: [sess("a", 0, { CHEST: 8 }), sess("b", 1, { BACK: 8 }), sess("c", 2, { QUADS: 8 })], availability: blockDay(2) }),
      { a: day(0), b: day(2), c: day(4) },
    );
    const [first] = proposeLayouts(input);
    const view = toReplacementOptionView(first!, name, { lead: true, judged: false });
    expect(["Best recovery", "Fewest changes", "Keeps your preferred times"]).toContain(view.title);
    expect(view.kind).toBe("lens");
    expect(view.placements.map((p) => p.sessionId).sort()).toEqual(first!.moves.map((m) => m.sessionId).sort());
    expect(view.moves).toHaveLength(first!.moves.length);
    expect(view.skipped).toEqual([]);
    expect(view.lead).toBe(true);
  });

  it("titles a skip option with the session's label and explains why", () => {
    const ids = ["a", "b", "c", "d", "e", "f"];
    const input = withSaved(
      makeInput({ sessions: ids.map((id, i) => sess(id, i, { CHEST: 2 + i })), availability: [...blockDay(3), ...blockDay(6)] }),
      Object.fromEntries(ids.map((id, i) => [id, day(i)])),
    );
    const view = toReplacementOptionView(proposeLayouts(input)[0]!, name, { lead: true, judged: true });
    expect(view.kind).toBe("skip");
    expect(view.title).toBe("Skip Arms this week");
    expect(view.skipped).toEqual([{ sessionId: "f", label: "Arms" }]);
    expect(view.reasons[0]).toBe("6 sessions are left this week and only 5 days are open.");
    expect(view.judged).toBe(true);
  });
});
