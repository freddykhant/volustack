// src/engine/progression-judgement.test.ts
import { describe, expect, it } from "vitest";
import { applyProgressionVerdicts, progressionNoulId, progressionQuestions } from "./step-week";
import { STEP_UP } from "./constants";
import type { AdaptationContext, WeekAdjustment } from "./types";
import type { CheckInFeedback } from "./types";
import type { Verdict } from "./judgement";

const ctx = {
  targets: [
    { muscle: "CHEST", weeklySetTarget: 16, priority: 1, mev: 8, mav: 14, effectiveMrv: 20 },
    { muscle: "BICEPS", weeklySetTarget: 12, priority: 0, mev: 6, mav: 10, effectiveMrv: 16 },
  ],
  splitType: "UPPER_LOWER", daysPerWeek: 4, sessionLengthCapMin: 75,
  blockLengthWeeks: 6, deloadWeekIndex: 6, isBeginner: false, library: [],
} as unknown as AdaptationContext;

const feedback: CheckInFeedback = {
  weekIndex: 3,
  muscles: [
    { muscle: "CHEST", recovery: 3, joint: 0, performance: 3 },
    { muscle: "BICEPS", recovery: 0, joint: 3, performance: 1 },
  ],
};

const adj: WeekAdjustment = {
  fromWeekIndex: 3, appliesToWeekIndex: 4, checkInValue: "low", facts: [],
  adjustments: [
    { muscle: "CHEST", plannedSets: 12, adjustedSets: 12, delta: 0, cause: "on_track", swapCandidate: false },
    { muscle: "BICEPS", plannedSets: 10, adjustedSets: 8, delta: -2, cause: "joint_stress", swapCandidate: true },
  ],
};

const noul = (muscle: string, n: number): Verdict => ({ id: progressionNoulId(muscle), kind: "noul", noul: n });

/** The four causes `isAmbiguous` excludes: the three clinical/structural/arithmetic
 * floors plus the structural default. Every one must be un-askable and un-writable. */
const EXCLUDED_CAUSES = ["joint_stress", "under_recovered", "approaching_mrv", "default_progression"] as const;

describe("progressionQuestions", () => {
  it("asks only about muscles in the ambiguous middle", () => {
    const req = progressionQuestions(adj, ctx, feedback, [], new Map());
    expect(req.questions.map((q) => q.id)).toEqual([progressionNoulId("CHEST")]);
  });

  it("never asks about a safety-preempted muscle", () => {
    const req = progressionQuestions(adj, ctx, feedback, [], new Map());
    expect(req.questions.some((q) => q.id.includes("BICEPS"))).toBe(false);
  });

  it("uses a noul, not a two-option choice", () => {
    const req = progressionQuestions(adj, ctx, feedback, [], new Map());
    expect(req.questions[0]!.kind).toBe("noul");
    expect(req.questions[0]!.authority).toBe("PROPOSAL");
  });

  it("names the muscle in the instructions, since ids are not sent to the model", () => {
    const req = progressionQuestions(adj, ctx, feedback, [], new Map());
    expect(req.questions[0]!.instructions).toContain("CHEST");
    expect(req.questions[0]!.instructions).toContain("muscles.CHEST");
  });

  it("projects labels, not landmark numbers", () => {
    const req = progressionQuestions(adj, ctx, feedback, [], new Map());
    const json = JSON.stringify(req.state);
    expect(json).toContain("headroomToCeiling");
    expect(json).not.toContain('"effectiveMrv"');
    expect(json).not.toContain('"mav"');
  });

  it("asks nothing when no muscle is ambiguous", () => {
    const allGuarded: WeekAdjustment = {
      ...adj,
      adjustments: [{ ...adj.adjustments[1]!, muscle: "BICEPS" }],
    };
    expect(progressionQuestions(allGuarded, ctx, feedback, [], new Map()).questions).toHaveLength(0);
  });

  it.each(EXCLUDED_CAUSES)("emits no question for a muscle guarded by cause=%s", (cause) => {
    const guarded: WeekAdjustment = {
      ...adj,
      adjustments: [{ muscle: "BICEPS", plannedSets: 10, adjustedSets: 10, delta: 0, cause, swapCandidate: false }],
    };
    const req = progressionQuestions(guarded, ctx, feedback, [], new Map());
    expect(req.questions).toHaveLength(0);
  });
});

describe("applyProgressionVerdicts", () => {
  it("is identity on an empty verdict list", () => {
    expect(applyProgressionVerdicts(adj, ctx, [])).toEqual(adj);
  });

  it("steps up and relabels when the noul clears the gate", () => {
    const out = applyProgressionVerdicts(adj, ctx, [noul("CHEST", 0.9)]);
    const chest = out.adjustments.find((a) => a.muscle === "CHEST")!;
    expect(chest.cause).toBe("responding_well");
    expect(chest.adjustedSets).toBe(12 + STEP_UP);
    expect(chest.delta).toBe(STEP_UP);
    expect(out.facts.some((f) => f.kind === "judged")).toBe(true);
  });

  it("leaves the engine's on_track standing below the gate", () => {
    const out = applyProgressionVerdicts(adj, ctx, [noul("CHEST", 0.4)]);
    expect(out.adjustments.find((a) => a.muscle === "CHEST")!.cause).toBe("on_track");
    expect(out.adjustments.find((a) => a.muscle === "CHEST")!.adjustedSets).toBe(12);
  });

  it("records a close_call near the midpoint", () => {
    const out = applyProgressionVerdicts(adj, ctx, [noul("CHEST", 0.52)]);
    expect(out.facts.some((f) => f.kind === "close_call")).toBe(true);
  });

  it("SAFETY: never touches a preempted muscle, whatever the verdict says", () => {
    for (const n of [0.99, 0.5, 0, NaN, -1, 2]) {
      const out = applyProgressionVerdicts(adj, ctx, [noul("BICEPS", n)]);
      const biceps = out.adjustments.find((a) => a.muscle === "BICEPS")!;
      expect(biceps.cause).toBe("joint_stress");
      expect(biceps.adjustedSets).toBe(8);
    }
  });

  it.each(EXCLUDED_CAUSES)("SAFETY: a clearing verdict never touches a muscle guarded by cause=%s", (cause) => {
    const guarded: WeekAdjustment = {
      ...adj,
      adjustments: [{ muscle: "BICEPS", plannedSets: 10, adjustedSets: 10, delta: 0, cause, swapCandidate: false }],
    };
    const out = applyProgressionVerdicts(guarded, ctx, [noul("BICEPS", 0.95)]);
    const biceps = out.adjustments[0]!;
    expect(biceps.cause).toBe(cause);
    expect(biceps.adjustedSets).toBe(10);
  });

  it("FAIL-CLOSED: a verdict for an ambiguous muscle with no target is not applied", () => {
    const noTarget: WeekAdjustment = {
      ...adj,
      adjustments: [{ muscle: "HAMSTRINGS", plannedSets: 10, adjustedSets: 10, delta: 0, cause: "on_track", swapCandidate: false }],
    };
    const out = applyProgressionVerdicts(noTarget, ctx, [noul("HAMSTRINGS", 0.95)]);
    const h = out.adjustments[0]!;
    expect(h.cause).toBe("on_track");
    expect(h.adjustedSets).toBe(10);
    expect(out.facts.some((f) => f.kind === "judged")).toBe(false);
  });

  it("CLAMP: never exceeds effectiveMrv", () => {
    const atCeiling: WeekAdjustment = {
      ...adj,
      adjustments: [{ muscle: "CHEST", plannedSets: 20, adjustedSets: 20, delta: 0, cause: "on_track", swapCandidate: false }],
    };
    const out = applyProgressionVerdicts(atCeiling, ctx, [noul("CHEST", 0.95)]);
    expect(out.adjustments[0]!.adjustedSets).toBe(20);
  });

  it("never throws on garbage verdicts", () => {
    const junk = [
      { id: progressionNoulId("CHEST"), kind: "choice", choice: "x", confidence: NaN, probabilities: {} },
      { id: "unknown", kind: "noul", noul: 0.9 },
    ] as unknown as Verdict[];
    expect(() => applyProgressionVerdicts(adj, ctx, junk)).not.toThrow();
    expect(applyProgressionVerdicts(adj, ctx, junk).adjustments[0]!.cause).toBe("on_track");
  });
});
