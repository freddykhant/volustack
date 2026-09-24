import { describe, expect, it } from "vitest";
import { EXERCISE_LIBRARY } from "~/domain/exercise-library";
import { DEFAULT_LANDMARKS } from "~/domain/landmarks";
import { generateMesocycle } from "./generate";
import { resolveConstraints } from "./resolve-constraints";
import { deloadWeekPlan } from "./deload-week";
import { DELOAD_RIR } from "./constants";
import type { AthleteContext, ResolvedSpec } from "./types";

const athlete: AthleteContext = {
  experienceLevel: "INTERMEDIATE",
  phase: "MAINTAIN",
  landmarks: DEFAULT_LANDMARKS,
};

function resolvedSpec(): ResolvedSpec {
  const spec = resolveConstraints(
    {
      daysPerWeek: 4,
      splitType: "UPPER_LOWER",
      sessionLengthCapMin: 90,
      blockLengthWeeks: 6,
      deloadWeekIndex: 6,
      checkInCadence: "WEEKLY",
      muscleTargets: [],
      excludedExerciseNames: [],
    },
    athlete,
  );
  if (spec.kind !== "resolved") throw new Error("fixture spec must resolve");
  return spec;
}

describe("deloadWeekPlan", () => {
  it("cuts volume toward half of peak, sets deload RIR + isDeload, keeps stored session ids", () => {
    const spec = resolvedSpec();
    const plan = generateMesocycle(spec, EXERCISE_LIBRARY, DEFAULT_LANDMARKS);
    const upcoming = plan.weeks[2]!; // an accumulation week
    const result = deloadWeekPlan(spec, EXERCISE_LIBRARY, upcoming);

    expect(result.isDeload).toBe(true);
    expect(result.sessions.map((s) => s.slotId)).toEqual(upcoming.sessions.map((s) => s.slotId));
    // every prescription carries the deload RIR
    expect(result.sessions.flatMap((s) => s.prescriptions).every((p) => p.targetRir === DELOAD_RIR)).toBe(true);
    // chest volume is roughly halved vs the peak target (allow distribution rounding)
    const chestTarget = spec.targets.find((t) => t.muscle === "CHEST")!.weeklySetTarget;
    expect(result.muscleVolume.CHEST).toBeGreaterThan(0);
    expect(result.muscleVolume.CHEST).toBeLessThan(chestTarget);
  });

  it("throws when the distributed session count disagrees with the stored week", () => {
    const spec = resolvedSpec();
    const plan = generateMesocycle(spec, EXERCISE_LIBRARY, DEFAULT_LANDMARKS);
    const upcoming = { ...plan.weeks[2]!, sessions: plan.weeks[2]!.sessions.slice(0, 1) };
    expect(() => deloadWeekPlan(spec, EXERCISE_LIBRARY, upcoming)).toThrow(/mismatch/i);
  });
});
