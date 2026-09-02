// src/engine/properties.test.ts
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DEFAULT_LANDMARKS } from "~/domain/landmarks";
import { EXERCISE_LIBRARY } from "~/domain/exercise-library";
import { generateMesocycle, resolveConstraints } from "./index";
import { sessionMinutes } from "./time";
import { arbAthlete, arbConstraintSet } from "./_fixtures/arbitraries";

describe("engine invariants", () => {
  it("every session fits the time cap, or the plan is honestly flagged infeasible", () => {
    fc.assert(
      fc.property(arbConstraintSet(), arbAthlete(), (input, athlete) => {
        const spec = resolveConstraints(input, athlete);
        if (spec.kind !== "resolved") return; // infeasible inputs are vacuously fine
        const plan = generateMesocycle(spec, EXERCISE_LIBRARY, DEFAULT_LANDMARKS);
        const infeasible = plan.facts.some((f) => f.kind === "infeasible" && f.constraint === "session_time");
        for (const w of plan.weeks) {
          for (const s of w.sessions) {
            const est = sessionMinutes(s.prescriptions);
            expect(est <= input.sessionLengthCapMin || infeasible).toBe(true);
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it("no excluded exercise ever appears", () => {
    fc.assert(
      fc.property(
        arbConstraintSet(),
        arbAthlete(),
        fc.constantFrom("Barbell Back Squat", "Barbell Bench Press"),
        (input, athlete, banned) => {
          const spec = resolveConstraints({ ...input, excludedExerciseNames: [banned] }, athlete);
          if (spec.kind !== "resolved") return;
          const plan = generateMesocycle(spec, EXERCISE_LIBRARY, DEFAULT_LANDMARKS);
          const names = plan.weeks.flatMap((w) => w.sessions.flatMap((s) => s.prescriptions.map((p) => p.exerciseName)));
          expect(names).not.toContain(banned);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("no week exceeds effective MRV (+0.5 rounding tolerance), or a ramp_flattened fact explains the residual", () => {
    fc.assert(
      fc.property(arbConstraintSet(), arbAthlete(), (input, athlete) => {
        const spec = resolveConstraints(input, athlete);
        if (spec.kind !== "resolved") return;
        const plan = generateMesocycle(spec, EXERCISE_LIBRARY, DEFAULT_LANDMARKS);
        for (const w of plan.weeks) {
          for (const t of spec.targets) {
            const withinMrv = w.muscleVolume[t.muscle] <= t.effectiveMrv + 0.5;
            const flattened = plan.facts.some((f) => f.kind === "ramp_flattened" && f.muscle === t.muscle);
            expect(withinMrv || flattened).toBe(true);
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it("is deterministic — deep-equal across two runs", () => {
    fc.assert(
      fc.property(arbConstraintSet(), arbAthlete(), (input, athlete) => {
        const a = resolveConstraints(input, athlete);
        const b = resolveConstraints(input, athlete);
        expect(a).toEqual(b);
        if (a.kind !== "resolved" || b.kind !== "resolved") return;
        const pa = generateMesocycle(a, EXERCISE_LIBRARY, DEFAULT_LANDMARKS);
        const pb = generateMesocycle(b, EXERCISE_LIBRARY, DEFAULT_LANDMARKS);
        expect(pa).toEqual(pb);
      }),
      { numRuns: 100 },
    );
  });

  it("every resolved deviation carries an explaining fact", () => {
    fc.assert(
      fc.property(arbConstraintSet(), arbAthlete(), (input, athlete) => {
        const spec = resolveConstraints(input, athlete);
        if (spec.kind !== "resolved") return;
        const plan = generateMesocycle(spec, EXERCISE_LIBRARY, DEFAULT_LANDMARKS);
        // Peak week volume off-target > 0.5 for a targeted muscle ⇒ a deviation/trim/moved/split fact mentions it.
        // Peak is the LAST non-deload week (ramp climbs from RAMP_START_FRACTION up to 1.0 there);
        // deloadWeekIndex defaults to the final week, so the FIRST non-deload week is the ramp
        // *start* (~75% of peak), not the peak — using it here would compare a deliberately
        // ramped-down week against the unramped target and misfire on the ramp itself.
        const accumWeeks = plan.weeks.filter((w) => !w.isDeload);
        const peak = accumWeeks[accumWeeks.length - 1]!;
        for (const t of spec.targets) {
          const off = Math.abs(peak.muscleVolume[t.muscle] - t.weeklySetTarget) > 0.5;
          if (!off) continue;
          const explained = plan.facts.some(
            (f) => "muscle" in f && f.muscle === t.muscle,
          );
          expect(explained).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });
});
