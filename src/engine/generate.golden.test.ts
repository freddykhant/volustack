// src/engine/generate.golden.test.ts
import { describe, expect, it } from "vitest";
import { EXERCISE_LIBRARY } from "~/domain/exercise-library";
import { DEFAULT_LANDMARKS } from "~/domain/landmarks";
import { generateMesocycle, resolveConstraints } from "./index";
import { sessionMinutes } from "./time";
import { CANONICAL_ATHLETE, CANONICAL_INPUT } from "./_fixtures/canonical";

describe("golden: canonical mesocycle", () => {
  it("resolves feasibly", () => {
    const spec = resolveConstraints(CANONICAL_INPUT, CANONICAL_ATHLETE);
    expect(spec.kind).toBe("resolved");
  });

  it("matches the frozen snapshot", () => {
    const spec = resolveConstraints(CANONICAL_INPUT, CANONICAL_ATHLETE);
    if (spec.kind !== "resolved") throw new Error("expected resolved");
    const plan = generateMesocycle(spec, EXERCISE_LIBRARY, DEFAULT_LANDMARKS);
    expect(plan).toMatchSnapshot();
  });

  it("honors the headline constraints (domain sanity check)", () => {
    const spec = resolveConstraints(CANONICAL_INPUT, CANONICAL_ATHLETE);
    if (spec.kind !== "resolved") throw new Error("expected resolved");
    const plan = generateMesocycle(spec, EXERCISE_LIBRARY, DEFAULT_LANDMARKS);

    // no squats
    const names = plan.weeks.flatMap((w) => w.sessions.flatMap((s) => s.prescriptions.map((p) => p.exerciseName)));
    expect(names).not.toContain("Barbell Back Squat");

    // every session inside the 75-min cap
    for (const w of plan.weeks) {
      for (const s of w.sessions) expect(sessionMinutes(s.prescriptions)).toBeLessThanOrEqual(75);
    }

    // peak-week chest/back land near target (±2 sets)
    const peak = plan.weeks[4]!; // week 5, last accumulation week
    expect(Math.abs(peak.muscleVolume.CHEST - 16)).toBeLessThanOrEqual(2);
    expect(Math.abs(peak.muscleVolume.BACK - 18)).toBeLessThanOrEqual(2);
  });
});
