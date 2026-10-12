import { describe, expect, it } from "vitest";
import { makeInput, sess, withSaved } from "./_fixtures/schedule";
import { checkLayout, lensCost, placeWeek, placeWithLens, scoreLayout, type Layout } from "./schedule";

const day = (d: number) => ({ day: d, daypart: null });

// Mon push, Wed pull, Fri legs: nothing overlaps, all well rested.
const base = makeInput({
  sessions: [sess("push", 0, { CHEST: 8 }), sess("pull", 1, { BACK: 8 }), sess("legs", 2, { QUADS: 8 })],
});
const saved: Layout = { push: day(0), pull: day(2), legs: day(4) };

describe("lensCost", () => {
  it("equals the plain score under BALANCED", () => {
    const input = withSaved(base, saved);
    expect(lensCost(input, saved, "BALANCED")).toBe(scoreLayout(input, saved).cost);
  });

  it("charges each session that left its saved placement under FEWEST_CHANGES", () => {
    const input = withSaved(base, saved);
    const moved: Layout = { ...saved, legs: day(5) };
    const plain = scoreLayout(input, moved).cost;
    expect(lensCost(input, moved, "FEWEST_CHANGES")).toBe(plain + 50);
    expect(lensCost(input, saved, "FEWEST_CHANGES")).toBe(scoreLayout(input, saved).cost);
  });

  it("weighs an off-preference session five times under KEEPS_PREFERENCES", () => {
    const input = withSaved(
      { ...base, availability: [{ day: 6, daypart: "AM", state: "PREFERRED" }] },
      saved,
    );
    const offFacts = scoreLayout(input, saved).facts.filter((f) => f.kind === "off_preference").length;
    expect(offFacts).toBeGreaterThan(0);
    expect(lensCost(input, saved, "KEEPS_PREFERENCES")).toBe(scoreLayout(input, saved).cost + 4 * 2 * offFacts);
  });
});

describe("placeWithLens", () => {
  it("BALANCED gives exactly what placeWeek gives", () => {
    const input = withSaved(base, saved);
    expect(placeWithLens(input, "BALANCED")).toEqual(placeWeek(input));
  });

  it("FEWEST_CHANGES moves only the session whose day was blocked", () => {
    const input = withSaved(
      {
        ...base,
        availability: [
          { day: 2, daypart: "AM", state: "BLOCKED" },
          { day: 2, daypart: "PM", state: "BLOCKED" },
        ],
      },
      saved,
    );
    const res = placeWithLens(input, "FEWEST_CHANGES");
    expect(res.kind).toBe("placed");
    if (res.kind !== "placed") return;
    expect(res.layout.push).toEqual(day(0));
    expect(res.layout.legs).toEqual(day(4));
    expect(res.layout.pull!.day).not.toBe(2);
    expect(checkLayout(input, res.layout)).toEqual([]);
  });

  it("never moves a completed session", () => {
    const input = withSaved(
      { ...base, sessions: [sess("push", 0, { CHEST: 8 }, null, true), base.sessions[1]!, base.sessions[2]!] },
      saved,
    );
    for (const lens of ["BALANCED", "FEWEST_CHANGES", "KEEPS_PREFERENCES"] as const) {
      const res = placeWithLens(input, lens);
      expect(res.kind).toBe("placed");
      if (res.kind === "placed") expect(res.layout.push).toEqual(day(0));
    }
  });

  it("is infeasible when there are no open cells", () => {
    const input = withSaved({ ...base, firstOpenDay: 7 }, saved);
    expect(placeWithLens(input, "FEWEST_CHANGES").kind).toBe("infeasible");
  });
});
