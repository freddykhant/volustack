import { describe, expect, it } from "vitest";
import { makeInput, sess, withSaved } from "./_fixtures/schedule";
import { explainPlacement, scoreLayout, type Layout } from "./schedule";

const day = (d: number) => ({ day: d, daypart: null });

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
    const improved = scoreLayout(withSaved(base, crowded), { ...crowded, legsB: ex.better! }).cost;
    expect(improved).toBeLessThan(scoreLayout(withSaved(base, crowded), crowded).cost);
  });

  it("lists only facts that name the session as its current facts", () => {
    const crowded: Layout = { ...saved, legsB: day(3) };
    const ex = explainPlacement(withSaved(base, crowded), crowded, "push")!;
    expect(ex.currentFacts.every((f) => JSON.stringify(f).includes("push"))).toBe(true);
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
