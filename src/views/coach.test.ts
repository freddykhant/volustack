import { describe, expect, it } from "vitest";
import { SUGGESTION_MIN_GAIN } from "~/engine/constants";
import type { PlacementExplanation } from "~/engine/schedule";
import {
  blockSummary,
  cellLabel,
  dateLabel,
  joinList,
  phraseExplanation,
  phraseNextSession,
  phraseRecovery,
  phraseWeekIssues,
  placeName,
  skipSummary,
  unblockSummary,
} from "./coach";

const label = (id: string) => ({ legsA: "Legs A", legsB: "Legs B", push: "Push" })[id] ?? "Session";

describe("dates and lists", () => {
  it("joins lists the way a person would", () => {
    expect(joinList(["A"])).toBe("A");
    expect(joinList(["A", "B"])).toBe("A and B");
    expect(joinList(["A", "B", "C"])).toBe("A, B and C");
  });
  it("labels a date with its weekday and month", () => {
    expect(dateLabel("2026-10-15")).toBe("Thu 15 Oct");
    expect(dateLabel("2026-11-01")).toBe("Sun 1 Nov");
  });
  it("labels a half-day in words", () => {
    expect(cellLabel({ date: "2026-10-15", daypart: null })).toBe("Thu 15 Oct");
    expect(cellLabel({ date: "2026-10-15", daypart: "AM" })).toBe("Thu 15 Oct (morning)");
    expect(cellLabel({ date: "2026-10-15", daypart: "PM" })).toBe("Thu 15 Oct (afternoon)");
  });
  it("names a placement", () => {
    expect(placeName({ day: 3, daypart: null })).toBe("Thursday");
    expect(placeName({ day: 3, daypart: "PM" })).toBe("Thursday afternoon");
  });
});

describe("confirm summaries", () => {
  const cells = [
    { date: "2026-10-15", daypart: null },
    { date: "2026-10-16", daypart: "AM" as const },
    { date: "2026-10-17", daypart: null },
  ];
  it("asks to block the dates in order", () => {
    expect(blockSummary(cells)).toBe("Block Thu 15 Oct, Fri 16 Oct (morning) and Sat 17 Oct?");
  });
  it("asks to unblock", () => {
    expect(unblockSummary([cells[0]!])).toBe("Unblock Thu 15 Oct?");
  });
  it("asks to skip a session, with its day when it has one", () => {
    expect(skipSummary("Legs B", { day: 4, daypart: null })).toBe("Skip Legs B on Friday this week?");
    expect(skipSummary("Legs B", null)).toBe("Skip Legs B this week?");
  });
});

describe("phraseExplanation", () => {
  const shortRest = {
    kind: "short_rest" as const,
    sessionId: "legsB",
    otherSessionId: "legsA",
    muscle: "QUADS" as const,
    gapHalfDays: 2,
    targetHalfDays: 4,
  };
  const ex: PlacementExplanation = {
    sessionId: "legsB",
    current: { day: 4, daypart: null },
    currentFacts: [],
    alternatives: [
      { to: { day: 3, daypart: null }, delta: 16, adds: [shortRest], worsens: [], resolves: [] },
      { to: { day: 5, daypart: null }, delta: 0, adds: [], worsens: [], resolves: [] },
    ],
    better: null,
    isBest: true,
    inSuggestion: false,
  };

  it("states where it is, what each neighbour would cost, and that no move is worth making", () => {
    expect(phraseExplanation(ex, label)).toEqual([
      "Legs B is on Friday.",
      "If it moved to Thursday: Legs B is only 1 day after Legs A, and both train quads.",
      "Saturday would be about the same.",
      "The engine sees no move worth making for it this week.",
    ]);
  });

  it("phrases a problem that would get worse, not only one that would appear", () => {
    const lines = phraseExplanation(
      { ...ex, alternatives: [{ to: { day: 0, daypart: null }, delta: 16, adds: [], worsens: [shortRest], resolves: [] }] },
      label,
    );
    expect(lines[1]).toBe("If it moved to Monday: Legs B is only 1 day after Legs A, and both train quads.");
  });

  it("names the better spot when there is one, and the current problems", () => {
    const friday = { to: { day: 4, daypart: null }, delta: -16, adds: [], worsens: [], resolves: [shortRest] };
    const lines = phraseExplanation(
      { ...ex, current: { day: 3, daypart: null }, currentFacts: [shortRest], alternatives: [friday], better: friday, isBest: false },
      label,
    );
    expect(lines).toEqual([
      "Legs B is on Thursday.",
      "Right now: Legs B is only 1 day after Legs A, and both train quads.",
      "Friday would be better.",
      "The engine would put it on Friday.",
    ]);
  });

  it("points to the board when a suggestion already involves the session", () => {
    const lines = phraseExplanation({ ...ex, inSuggestion: true }, label);
    expect(lines.at(-1)).toBe("The board has a suggested change that involves it.");
  });

  it("describes a worse neighbour that has no named problem", () => {
    const lines = phraseExplanation(
      { ...ex, alternatives: [{ to: { day: 6, daypart: null }, delta: 2, adds: [], worsens: [], resolves: [] }] },
      label,
    );
    expect(lines[1]).toBe("Sunday would score slightly worse.");
  });

  it("grades a cheaper neighbour against the suggestion bar", () => {
    const at = (delta: number, adds: (typeof shortRest)[] = []) =>
      phraseExplanation(
        { ...ex, alternatives: [{ to: { day: 5, daypart: null }, delta, adds, worsens: [], resolves: [] }] },
        label,
      )[1];
    expect(at(0)).toBe("Saturday would be about the same.");
    expect(at(-0.3)).toBe("Saturday would be about the same.");
    expect(at(-1)).toBe("Saturday would be slightly better.");
    expect(at(-SUGGESTION_MIN_GAIN)).toBe("Saturday would be slightly better.");
    expect(at(-16)).toBe("Saturday would be better.");
    expect(at(-1, [shortRest])).toBe(
      "Saturday would be slightly better overall, but: Legs B is only 1 day after Legs A, and both train quads.",
    );
    expect(at(0.2, [shortRest])).toBe(
      "Saturday would be about the same overall, but: Legs B is only 1 day after Legs A, and both train quads.",
    );
  });

  it("says so when there is nowhere else to go", () => {
    expect(phraseExplanation({ ...ex, alternatives: [] }, label)).toEqual([
      "Legs B is on Friday.",
      "There is no other open time for it this week.",
    ]);
  });
});

describe("answers", () => {
  it("phrases the next session", () => {
    expect(
      phraseNextSession({
        label: "Upper A",
        placement: { day: 3, daypart: "AM" },
        minutes: 60,
        first: { exerciseName: "Barbell Bench Press", sets: 4, repLow: 6, repHigh: 10 },
      }),
    ).toEqual(["Next up is Upper A on Thursday morning, about 60 minutes.", "It starts with Barbell Bench Press, 4 sets of 6 to 10."]);
    const bench = { exerciseName: "Barbell Bench Press", sets: 4, repLow: 6, repHigh: 10 };
    const upper = { label: "Upper A", placement: { day: 3, daypart: "AM" as const }, minutes: 60, first: null };
    expect(phraseNextSession({ ...upper, minutes: 0 })).toEqual(["Next up is Upper A on Thursday morning."]);
    expect(phraseNextSession({ ...upper, minutes: 0, first: bench })).toEqual([
      "Next up is Upper A on Thursday morning.",
      "It starts with Barbell Bench Press, 4 sets of 6 to 10.",
    ]);
    expect(phraseNextSession({ ...upper, minutes: 1 })).toEqual(["Next up is Upper A on Thursday morning, about 1 minute."]);
    expect(phraseNextSession({ ...upper, first: { ...bench, sets: 1, repLow: 8, repHigh: 8 } })[1]).toBe(
      "It starts with Barbell Bench Press, 1 set of 8.",
    );
    expect(phraseNextSession({ label: "Upper A", placement: null, minutes: 0, first: null })).toEqual([
      "Next up is Upper A. It isn't placed on a day yet.",
    ]);
    expect(phraseNextSession(null)).toEqual(["Every session this week is done or missed."]);
  });

  it("phrases recovery from the readiness numbers and label only", () => {
    expect(phraseRecovery({ fitness: 12.34, fatigue: 14.1, form: -1.76, label: "Productive" })).toEqual([
      "Your form reads Productive.",
      "Fitness 12.3, fatigue 14.1, form -1.8.",
    ]);
    expect(phraseRecovery(null)).toEqual(["There isn't enough logged training yet to read your recovery."]);
  });

  it("phrases the week's issues, or their absence", () => {
    expect(phraseWeekIssues([], null)).toEqual(["No warnings this week."]);
    expect(phraseWeekIssues(["4 training days in a row."], { headline: "Move Push from Mon to Tue.", reasons: [] })).toEqual([
      "4 training days in a row.",
      "Suggested: Move Push from Mon to Tue.",
    ]);
  });
});
