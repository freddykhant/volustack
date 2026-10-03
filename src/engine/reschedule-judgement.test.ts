// src/engine/reschedule-judgement.test.ts
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  RESCHEDULE_PICK_ID,
  applyRescheduleVerdicts,
  rescheduleQuestions,
} from "./redistribute";
import type { AdaptationContext, RedistributionCandidate, WeekPlan } from "./types";
import type { Verdict } from "./judgement";

const week: WeekPlan = {
  index: 4, isDeload: false,
  muscleVolume: { CHEST: 14 } as WeekPlan["muscleVolume"],
  // At least one session with a prescription, so Law 1 has a `sets` count to assert on.
  sessions: [
    {
      slotId: "mon",
      label: "Upper A",
      prescriptions: [
        { exerciseName: "Bench Press", sets: 3, repRangeLow: 6, repRangeHigh: 10, targetRir: 2 },
      ],
      estimatedMinutes: 30,
    },
  ],
};

const ctx = {
  targets: [{ muscle: "CHEST", weeklySetTarget: 16, priority: 1, mev: 8, mav: 14, effectiveMrv: 20 }],
  splitType: "UPPER_LOWER", daysPerWeek: 4, sessionLengthCapMin: 75,
  blockLengthWeeks: 6, deloadWeekIndex: 6, isBeginner: false, library: [],
} as unknown as AdaptationContext;

const cand = (kind: RedistributionCandidate["kind"], recommended: boolean): RedistributionCandidate => ({
  kind, week, tradeoff: { recovered: kind === "LET_GO" ? 0 : 6, dropped: kind === "LET_GO" ? 6 : 0 },
  recommended, facts: [],
});

const candidates = [cand("MAKE_UP", true), cand("LET_GO", false)];

describe("rescheduleQuestions", () => {
  it("offers only the candidates that exist", () => {
    const req = rescheduleQuestions(candidates, week, ctx, []);
    const pick = req.questions.find((q) => q.id === RESCHEDULE_PICK_ID)!;
    expect(pick.kind).toBe("choice");
    expect(Object.keys((pick as { options: Record<string, unknown> }).options).sort()).toEqual(["LET_GO", "MAKE_UP"]);
  });

  it("batches the recorded-only questions into the same request", () => {
    const req = rescheduleQuestions(candidates, week, ctx, []);
    expect(req.questions.map((q) => q.id).sort()).toEqual([
      "overreaching", RESCHEDULE_PICK_ID, "volume_loss_materiality",
    ].sort());
  });

  it("projects derived labels and no raw landmark numbers", () => {
    const req = rescheduleQuestions(candidates, week, ctx, []);
    const json = JSON.stringify(req.state);
    expect(json).toContain("at or above MAV");
    expect(json).toContain("late");
    // The model must never be handed landmarks to compare.
    expect(json).not.toContain('"mev"');
    expect(json).not.toContain('"effectiveMrv"');
  });

  it("names the subject inside the instructions, since ids are not sent", () => {
    const req = rescheduleQuestions(candidates, week, ctx, []);
    for (const q of req.questions) expect(q.instructions.length).toBeGreaterThan(20);
  });
});

describe("applyRescheduleVerdicts", () => {
  const confident = (choice: string, probabilities: Record<string, number>): Verdict => ({
    id: RESCHEDULE_PICK_ID, kind: "choice", choice, confidence: 0.9, probabilities,
  });

  it("is identity on an empty verdict list", () => {
    expect(applyRescheduleVerdicts(candidates, [])).toEqual(candidates);
  });

  it("moves the recommendation and records a judged fact", () => {
    const out = applyRescheduleVerdicts(candidates, [confident("LET_GO", { LET_GO: 0.9, MAKE_UP: 0.1 })]);
    expect(out.find((c) => c.kind === "LET_GO")!.recommended).toBe(true);
    expect(out.find((c) => c.kind === "MAKE_UP")!.recommended).toBe(false);
    const fact = out.find((c) => c.kind === "LET_GO")!.facts.find((f) => f.kind === "judged");
    expect(fact).toMatchObject({
      kind: "judged", subject: "reschedule", selected: "LET_GO", deterministic: "MAKE_UP",
      basis: { kind: "confidence", value: 0.9 },
    });
  });

  it("adds a close_call fact when the top two are near-tied", () => {
    const out = applyRescheduleVerdicts(candidates, [
      { id: RESCHEDULE_PICK_ID, kind: "choice", choice: "LET_GO", confidence: 0.61, probabilities: { LET_GO: 0.5, MAKE_UP: 0.45 } },
    ]);
    expect(out.find((c) => c.kind === "LET_GO")!.facts.some((f) => f.kind === "close_call")).toBe(true);
  });

  it("ignores a verdict for an option that was never offered", () => {
    expect(applyRescheduleVerdicts(candidates, [confident("PARTIAL", { PARTIAL: 1 })])).toEqual(candidates);
  });

  it("ignores an under-confident verdict", () => {
    const out = applyRescheduleVerdicts(candidates, [
      { id: RESCHEDULE_PICK_ID, kind: "choice", choice: "LET_GO", confidence: 0.3, probabilities: { LET_GO: 0.3 } },
    ]);
    expect(out).toEqual(candidates);
  });

  it("LAW 1: never changes a single number, for arbitrary verdicts", () => {
    // Weighted so valid, at/above-gate confidences for an OFFERED choice are common
    // (not vanishingly rare, which is what made the previous version of this property
    // vacuous — see Fix round 1 in task-6-report.md), while still mixing in garbage
    // confidences/ids/choices so the early-return path gets exercised too.
    const arbVerdict = fc.record({
      id: fc.constantFrom(RESCHEDULE_PICK_ID, "overreaching", "junk"),
      kind: fc.constant("choice" as const),
      choice: fc.constantFrom("MAKE_UP", "LET_GO", "PARTIAL", "", "???"),
      confidence: fc.oneof(
        { weight: 2, arbitrary: fc.double({ min: 0.6, max: 1, noNaN: true }) },
        { weight: 1, arbitrary: fc.double({ min: 0, max: 1, noNaN: true }) },
        { weight: 1, arbitrary: fc.double({ noNaN: false }) },
      ),
      probabilities: fc.dictionary(
        fc.constantFrom("MAKE_UP", "LET_GO", "PARTIAL"),
        fc.double({ min: 0, max: 1, noNaN: true }),
      ),
    });

    // Proof that the mutating branch is actually being reached: a "judged" fact is the
    // one thing only that branch ever produces, so counting it can never go vacuous
    // silently again — if a future threshold or arbitrary change collapses the hit
    // rate back to zero, the assertion below the loop catches it.
    let mutatingHits = 0;

    fc.assert(
      fc.property(fc.array(arbVerdict, { maxLength: 4 }), (verdicts) => {
        // Cloned BEFORE the call: `candidates`' two fixtures share one `week` object,
        // so comparing `out[i].week` back against the (possibly-mutated) `candidates[i]`
        // would just compare that object to itself. A deep snapshot taken up front is
        // immune to that aliasing and is the only thing that can actually catch an
        // in-place mutation.
        const before = structuredClone(candidates);
        const out = applyRescheduleVerdicts(candidates, verdicts);
        expect(out).toHaveLength(before.length);
        for (let i = 0; i < out.length; i++) {
          expect(out[i]!.kind).toBe(before[i]!.kind);
          expect(out[i]!.tradeoff).toEqual(before[i]!.tradeoff);
          expect(out[i]!.week.muscleVolume).toEqual(before[i]!.week.muscleVolume);
          expect(out[i]!.week.sessions.map((s) => s.prescriptions.map((p) => p.sets))).toEqual(
            before[i]!.week.sessions.map((s) => s.prescriptions.map((p) => p.sets)),
          );
        }
        if (out.some((c) => c.facts.some((f) => f.kind === "judged"))) mutatingHits++;
        // Unchanged, or exactly one recommendation survives.
        expect(out.filter((c) => c.recommended)).toHaveLength(1);
      }),
      { numRuns: 300 },
    );

    // A meaningful number, not zero — proof the mutating path above was actually hit,
    // not just the early return.
    expect(mutatingHits).toBeGreaterThan(10);
  });
});
