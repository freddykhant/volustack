// src/engine/adaptation.properties.test.ts
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DEFAULT_LANDMARKS } from "~/domain/landmarks";
import { EXERCISE_LIBRARY } from "~/domain/exercise-library";
import { generateMesocycle, resolveConstraints, stepWeek, redistributeWeek } from "./index";
import { sessionMinutes } from "./time";
import { arbAthlete, arbConstraintSet, ctxFromSpec } from "./_fixtures/arbitraries";
import type { CheckInFeedback } from "./types";

describe("adaptation invariants", () => {
  it("stepper monotonicity: better recovery never yields fewer sets, all else equal", () => {
    fc.assert(
      fc.property(arbConstraintSet(), arbAthlete(), (input, athlete) => {
        const spec = resolveConstraints(input, athlete);
        if (spec.kind !== "resolved") return;
        const plan = generateMesocycle(spec, EXERCISE_LIBRARY, DEFAULT_LANDMARKS);
        const ctx = ctxFromSpec(spec);
        const worse: CheckInFeedback = { weekIndex: 1, muscles: spec.targets.map((t) => ({ muscle: t.muscle, recovery: 1, performance: 2 })) };
        const better: CheckInFeedback = { weekIndex: 1, muscles: spec.targets.map((t) => ({ muscle: t.muscle, recovery: 3, performance: 2 })) };
        const lo = stepWeek(plan, 1, worse, ctx);
        const hi = stepWeek(plan, 1, better, ctx);
        for (const t of spec.targets) {
          const a = lo.adjustments.find((x) => x.muscle === t.muscle)!;
          const b = hi.adjustments.find((x) => x.muscle === t.muscle)!;
          expect(b.adjustedSets).toBeGreaterThanOrEqual(a.adjustedSets);
        }
      }),
      { numRuns: 150 },
    );
  });

  it("stepper stays within [mev, effectiveMrv] and emits a fact per muscle", () => {
    fc.assert(
      fc.property(arbConstraintSet(), arbAthlete(), (input, athlete) => {
        const spec = resolveConstraints(input, athlete);
        if (spec.kind !== "resolved") return;
        const plan = generateMesocycle(spec, EXERCISE_LIBRARY, DEFAULT_LANDMARKS);
        const ctx = ctxFromSpec(spec);
        const r = stepWeek(plan, 1, { weekIndex: 1, muscles: spec.targets.map((t) => ({ muscle: t.muscle, recovery: 3, performance: 3 })) }, ctx);
        for (const t of spec.targets) {
          const a = r.adjustments.find((x) => x.muscle === t.muscle)!;
          expect(a.adjustedSets).toBeLessThanOrEqual(t.effectiveMrv);
          expect(a.adjustedSets).toBeGreaterThanOrEqual(t.mev);
          expect(r.facts.some((f) => f.kind === "stepped" && "muscle" in f && f.muscle === t.muscle)).toBe(true);
        }
      }),
      { numRuns: 150 },
    );
  });

  it("redistribution: every candidate is a valid within-cap plan; recovered MAKE_UP ≥ LET_GO", () => {
    fc.assert(
      fc.property(arbConstraintSet(), arbAthlete(), (input, athlete) => {
        const spec = resolveConstraints(input, athlete);
        if (spec.kind !== "resolved") return;
        const plan = generateMesocycle(spec, EXERCISE_LIBRARY, DEFAULT_LANDMARKS);
        const ctx = ctxFromSpec(spec);
        const wk = plan.weeks.find((w) => !w.isDeload);
        if (!wk || wk.sessions.length < 2) return;
        const missedId = wk.sessions[wk.sessions.length - 1]!.slotId;
        const cands = redistributeWeek(wk, [missedId], ctx);
        const letGo = cands.find((c) => c.kind === "LET_GO");
        const makeUp = cands.find((c) => c.kind === "MAKE_UP");
        for (const c of cands) {
          for (const s of c.week.sessions) {
            expect(sessionMinutes(s.prescriptions)).toBeLessThanOrEqual(ctx.sessionLengthCapMin);
          }
        }
        if (letGo && makeUp) expect(makeUp.tradeoff.recovered).toBeGreaterThanOrEqual(letGo.tradeoff.recovered);
        if (cands.length > 0) expect(cands.filter((c) => c.recommended).length).toBe(1);
      }),
      { numRuns: 150 },
    );
  });
});
