import { describe, expect, it } from "vitest";
import {
  MAX_STREAK_DAYS,
  REST_TARGET_HALF_DAYS,
  SUGGESTION_MIN_GAIN,
  W_LOAD_STREAK,
  W_OFF_PREFERENCE,
  W_ON_BLOCKED_CELL,
  W_SAME_DAY_STACK,
  W_SHORT_REST,
  W_UNEVEN_SPREAD,
} from "./constants";
import { scoreLayout, type Footprint, type Placement } from "./schedule";
import { makeInput, sess } from "./_fixtures/schedule";

const day = (d: number): Placement => ({ day: d, daypart: null });
const LEGS: Footprint = { QUADS: 6, GLUTES: 4 };
const PUSH: Footprint = { CHEST: 6, TRICEPS: 3 };
const kinds = (facts: { kind: string }[]) => facts.map((f) => f.kind);

describe("schedule constants", () => {
  it("are all positive", () => {
    for (const w of [W_SHORT_REST, W_LOAD_STREAK, W_SAME_DAY_STACK, W_OFF_PREFERENCE, W_UNEVEN_SPREAD, W_ON_BLOCKED_CELL]) {
      expect(w).toBeGreaterThan(0);
    }
    expect(REST_TARGET_HALF_DAYS).toBeGreaterThanOrEqual(2);
    expect(MAX_STREAK_DAYS).toBeGreaterThanOrEqual(1);
  });

  it("make a blocked cell dominate every other term", () => {
    const others = W_SHORT_REST + W_LOAD_STREAK + W_SAME_DAY_STACK + W_OFF_PREFERENCE + W_UNEVEN_SPREAD;
    expect(W_ON_BLOCKED_CELL).toBeGreaterThan(50 * others);
  });

  it("keep the suggestion threshold above rounding noise", () => {
    expect(SUGGESTION_MIN_GAIN).toBeGreaterThanOrEqual(0.001);
  });
});

describe("scoreLayout — short_rest", () => {
  const input = makeInput({ sessions: [sess("a", 0, LEGS), sess("b", 1, LEGS)] });

  it("fires for shared muscles on consecutive days and reports the gap", () => {
    const { facts } = scoreLayout(input, { a: day(0), b: day(1) });
    expect(facts).toContainEqual({
      kind: "short_rest",
      sessionId: "b",
      otherSessionId: "a",
      muscle: "QUADS",
      gapHalfDays: 2,
      targetHalfDays: REST_TARGET_HALF_DAYS,
    });
  });

  it("does not fire once the gap reaches the target, and costs less", () => {
    const near = scoreLayout(input, { a: day(0), b: day(1) });
    const far = scoreLayout(input, { a: day(0), b: day(3) });
    expect(kinds(far.facts)).not.toContain("short_rest");
    expect(far.cost).toBeLessThan(near.cost);
  });

  it("does not fire when the sessions share no muscle", () => {
    const mixed = makeInput({ sessions: [sess("a", 0, LEGS), sess("b", 1, PUSH)] });
    expect(kinds(scoreLayout(mixed, { a: day(0), b: day(1) }).facts)).not.toContain("short_rest");
  });

  // Review Focus 4: a week that starts mid-week.
  it("treats Tue and Wed as far apart in a Wed-start week", () => {
    const wedStart = makeInput({ weekStartDay: 2, sessions: [sess("a", 0, LEGS), sess("b", 1, LEGS)] });
    expect(kinds(scoreLayout(wedStart, { a: day(2), b: day(1) }).facts)).not.toContain("short_rest");
  });

  it("counts half-days in HALF_DAY mode", () => {
    const half = makeInput({ mode: "HALF_DAY", sessions: [sess("a", 0, LEGS), sess("b", 1, LEGS)] });
    const { facts } = scoreLayout(half, { a: { day: 0, daypart: "PM" }, b: { day: 1, daypart: "AM" } });
    expect(facts.find((f) => f.kind === "short_rest")).toMatchObject({ gapHalfDays: 1 });
  });

  it("reaches back into the previous week through carryIn", () => {
    const withCarry = makeInput({
      sessions: [sess("a", 0, LEGS)],
      carryIn: [{ footprint: LEGS, halfDaysBeforeWeekStart: 2 }],
    });
    const { facts } = scoreLayout(withCarry, { a: day(0) });
    expect(facts).toContainEqual({
      kind: "short_rest",
      sessionId: "a",
      otherSessionId: null,
      muscle: "QUADS",
      gapHalfDays: 2,
      targetHalfDays: REST_TARGET_HALF_DAYS,
    });
  });
});

describe("scoreLayout — other terms", () => {
  it("reports a training streak longer than the limit", () => {
    const n = MAX_STREAK_DAYS + 1;
    const sessions = Array.from({ length: n }, (_, i) => sess(`s${i}`, i, {}));
    const layout = Object.fromEntries(sessions.map((s, i) => [s.id, day(i)]));
    const { facts } = scoreLayout(makeInput({ sessions }), layout);
    expect(facts).toContainEqual({ kind: "load_streak", days: n, limit: MAX_STREAK_DAYS });
  });

  it("reports two sessions stacked on one day in HALF_DAY mode", () => {
    const input = makeInput({ mode: "HALF_DAY", sessions: [sess("a", 0, LEGS), sess("b", 1, PUSH)] });
    const { facts } = scoreLayout(input, { a: { day: 2, daypart: "AM" }, b: { day: 2, daypart: "PM" } });
    expect(facts).toContainEqual({ kind: "same_day_stack", day: 2, sessionIds: ["a", "b"], sharedSets: 0 });
  });

  it("reports a session off a preferred cell only while a preferred cell is open", () => {
    const availability = [
      { day: 1, daypart: "AM" as const, state: "PREFERRED" as const },
      { day: 1, daypart: "PM" as const, state: "PREFERRED" as const },
    ];
    const input = makeInput({ sessions: [sess("a", 0, {})], availability });
    expect(scoreLayout(input, { a: day(0) }).facts).toContainEqual({ kind: "off_preference", sessionId: "a" });
    expect(kinds(scoreLayout(input, { a: day(1) }).facts)).not.toContain("off_preference");
  });

  it("reports a session standing on a blocked cell, at dominant cost", () => {
    const availability = [
      { day: 3, daypart: "AM" as const, state: "BLOCKED" as const },
      { day: 3, daypart: "PM" as const, state: "BLOCKED" as const },
    ];
    const input = makeInput({ sessions: [sess("a", 0, {}, day(3))], availability });
    const scored = scoreLayout(input, { a: day(3) });
    expect(scored.facts).toContainEqual({ kind: "on_blocked_cell", sessionId: "a", day: 3, daypart: null });
    expect(scored.cost).toBeGreaterThanOrEqual(W_ON_BLOCKED_CELL);
  });

  it("reports sessions bunched at one end and prefers them spread", () => {
    const input = makeInput({ sessions: [sess("a", 0, {}), sess("b", 1, {})] });
    const bunched = scoreLayout(input, { a: day(0), b: day(1) });
    const spread = scoreLayout(input, { a: day(0), b: day(3) });
    expect(bunched.facts).toContainEqual({ kind: "uneven_spread", longestGapDays: 6, shortestGapDays: 1 });
    expect(spread.cost).toBeLessThan(bunched.cost);
  });

  it("scores an empty layout at zero with no facts", () => {
    expect(scoreLayout(makeInput({ sessions: [sess("a", 0, LEGS)] }), {})).toEqual({ cost: 0, facts: [] });
  });
});

describe("scoreLayout — inert (missed) sessions", () => {
  const MISSED_PULL = (placement: Placement) => sess("missed", 0, LEGS, placement, true, true);

  it("raises no short_rest against a session that did not happen", () => {
    const input = makeInput({ sessions: [MISSED_PULL(day(0)), sess("b", 1, LEGS)] });
    const { facts, cost } = scoreLayout(input, { missed: day(0), b: day(1) });
    expect(kinds(facts)).not.toContain("short_rest");
    expect(cost).toBe(scoreLayout(makeInput({ sessions: [sess("b", 1, LEGS)] }), { b: day(1) }).cost);
  });

  it("does not count towards a training streak or the spread", () => {
    const n = MAX_STREAK_DAYS;
    const real = Array.from({ length: n }, (_, i) => sess(`s${i}`, i + 1, {}));
    const layout = Object.fromEntries(real.map((s, i) => [s.id, day(i)]));
    const missed = sess("missed", 0, {}, day(n), true, true);
    const withMissed = scoreLayout(makeInput({ sessions: [missed, ...real] }), { ...layout, missed: day(n) });
    const without = scoreLayout(makeInput({ sessions: real }), layout);
    expect(kinds(withMissed.facts)).not.toContain("load_streak");
    expect(withMissed).toEqual(without);
  });

  it("reports no same-day stack with a missed session in HALF_DAY mode", () => {
    const input = makeInput({
      mode: "HALF_DAY",
      sessions: [sess("missed", 0, LEGS, { day: 2, daypart: "AM" }, true, true), sess("b", 1, LEGS)],
    });
    const { facts } = scoreLayout(input, { missed: { day: 2, daypart: "AM" }, b: { day: 2, daypart: "PM" } });
    expect(kinds(facts)).not.toContain("same_day_stack");
  });

  it("does not make a preferred cell look taken", () => {
    const availability = [
      { day: 1, daypart: "AM" as const, state: "PREFERRED" as const },
      { day: 1, daypart: "PM" as const, state: "PREFERRED" as const },
    ];
    const input = makeInput({ availability, sessions: [sess("missed", 0, {}, day(1), true, true), sess("a", 1, {})] });
    // Day 1 is preferred and only a missed session sits there, so it is still open.
    expect(scoreLayout(input, { missed: day(1), a: day(0) }).facts).toContainEqual({ kind: "off_preference", sessionId: "a" });
  });

  it("charges no blocked-cell cost for a missed session on a blocked cell", () => {
    const availability = [
      { day: 3, daypart: "AM" as const, state: "BLOCKED" as const },
      { day: 3, daypart: "PM" as const, state: "BLOCKED" as const },
    ];
    const input = makeInput({ availability, sessions: [sess("missed", 0, {}, day(3), false, true)] });
    expect(scoreLayout(input, { missed: day(3) })).toEqual({ cost: 0, facts: [] });
  });
});
