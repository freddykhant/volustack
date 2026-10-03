// src/engine/judgement.test.ts
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  choiceCloseCall,
  isUsableChoice,
  isUsableNoulProposal,
  noulCloseCall,
  trendOf,
  verdictById,
  type Verdict,
} from "./judgement";
import { TREND_FLAT_BAND } from "./constants";

const choiceV = (
  over: Partial<Extract<Verdict, { kind: "choice" }>> = {},
): Extract<Verdict, { kind: "choice" }> => ({
  id: "pick",
  kind: "choice",
  choice: "MAKE_UP",
  confidence: 0.9,
  probabilities: { MAKE_UP: 0.9, LET_GO: 0.1 },
  ...over,
});

describe("verdictById", () => {
  it("finds by id and returns undefined when absent", () => {
    const v = choiceV();
    expect(verdictById([v], "pick")).toBe(v);
    expect(verdictById([v], "nope")).toBeUndefined();
  });
});

describe("isUsableChoice", () => {
  const offered = ["MAKE_UP", "LET_GO"];

  it("accepts a confident verdict for an offered option", () => {
    expect(isUsableChoice(choiceV(), offered)).toBe(true);
  });

  it("rejects an option that was never offered", () => {
    expect(isUsableChoice(choiceV({ choice: "TELEPORT" }), offered)).toBe(false);
  });

  it("rejects confidence below the gate", () => {
    expect(isUsableChoice(choiceV({ confidence: 0.4 }), offered)).toBe(false);
  });

  it("rejects non-probability confidence", () => {
    for (const c of [NaN, -1, 2, Infinity]) {
      expect(isUsableChoice(choiceV({ confidence: c }), offered)).toBe(false);
    }
  });

  it("rejects undefined and wrong-kind verdicts", () => {
    expect(isUsableChoice(undefined, offered)).toBe(false);
    expect(isUsableChoice({ id: "pick", kind: "noul", noul: 0.9 }, offered)).toBe(false);
  });
});

describe("isUsableNoulProposal", () => {
  it("gates on the noul probability itself", () => {
    expect(isUsableNoulProposal({ id: "q", kind: "noul", noul: 0.8 })).toBe(true);
    expect(isUsableNoulProposal({ id: "q", kind: "noul", noul: 0.6 })).toBe(false);
  });

  it("rejects garbage probabilities", () => {
    for (const n of [NaN, -0.5, 1.5]) {
      expect(isUsableNoulProposal({ id: "q", kind: "noul", noul: n })).toBe(false);
    }
  });
});

describe("choiceCloseCall", () => {
  it("reports the top-two gap when below the margin", () => {
    const cc = choiceCloseCall({
      id: "pick", kind: "choice", choice: "MAKE_UP", confidence: 0.5,
      probabilities: { MAKE_UP: 0.45, PARTIAL: 0.42, LET_GO: 0.13 },
    });
    expect(cc).toEqual({ between: ["MAKE_UP", "PARTIAL"], margin: 0.03 });
  });

  it("returns undefined for a clear winner", () => {
    expect(choiceCloseCall(choiceV())).toBeUndefined();
  });

  it("returns undefined with fewer than two options", () => {
    expect(
      choiceCloseCall({ id: "p", kind: "choice", choice: "A", confidence: 1, probabilities: { A: 1 } }),
    ).toBeUndefined();
  });
});

describe("noulCloseCall", () => {
  it("is close near 0.5 and not close when decisive", () => {
    expect(noulCloseCall(0.52)).toBe(true);
    expect(noulCloseCall(0.9)).toBe(false);
    // Below the 0.75 PROPOSAL gate but still a clear no — not a close call.
    expect(noulCloseCall(0.1)).toBe(false);
  });
});

describe("trendOf", () => {
  it("labels direction outside the flat band", () => {
    expect(trendOf([1, 5], TREND_FLAT_BAND)).toBe("rising");
    expect(trendOf([5, 1], TREND_FLAT_BAND)).toBe("falling");
    expect(trendOf([1, 1.1], TREND_FLAT_BAND)).toBe("flat");
  });

  it("is unknown without two points", () => {
    expect(trendOf([], TREND_FLAT_BAND)).toBe("unknown");
    expect(trendOf([3], TREND_FLAT_BAND)).toBe("unknown");
  });

  it("never throws on arbitrary numeric input", () => {
    fc.assert(
      fc.property(fc.array(fc.double({ noNaN: false })), (xs) => {
        expect(["rising", "falling", "flat", "unknown"]).toContain(trendOf(xs, TREND_FLAT_BAND));
      }),
      { numRuns: 200 },
    );
  });
});
