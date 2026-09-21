import { describe, expect, it } from "vitest";
import { EXERCISE_LIBRARY } from "~/domain/exercise-library";
import { DEFAULT_LANDMARKS } from "~/domain/landmarks";
import { generateMesocycle } from "./generate";
import { resolveConstraints } from "./resolve-constraints";
import { weekPlanFromAdjustment } from "./apply-adjustment";
import type { AthleteContext, ResolvedSpec, WeekAdjustment } from "./types";

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

describe("weekPlanFromAdjustment", () => {
  it("re-distributes to the adjusted targets and remaps onto the stored week's session ids", () => {
    const spec = resolvedSpec();
    const plan = generateMesocycle(spec, EXERCISE_LIBRARY, DEFAULT_LANDMARKS);
    const upcoming = plan.weeks[2]!; // week 3 (real slotIds in this fixture are template slot ids)
    const chest = spec.targets.find((t) => t.muscle === "CHEST")!;

    const adj: WeekAdjustment = {
      fromWeekIndex: 2,
      appliesToWeekIndex: 3,
      adjustments: [
        {
          muscle: "CHEST",
          plannedSets: upcoming.muscleVolume.CHEST,
          adjustedSets: Math.min(chest.effectiveMrv, upcoming.muscleVolume.CHEST + 2),
          delta: 2,
          cause: "responding_well",
          swapCandidate: false,
        },
      ],
      checkInValue: "low",
      facts: [],
    };

    const result = weekPlanFromAdjustment(spec, EXERCISE_LIBRARY, adj, upcoming);

    // session ids preserved from `upcoming` (not synthetic distribute ids)
    expect(result.sessions.map((s) => s.slotId)).toEqual(upcoming.sessions.map((s) => s.slotId));
    expect(result.index).toBe(3);
    // chest volume moved up toward the adjusted target
    expect(result.muscleVolume.CHEST).toBeGreaterThan(upcoming.muscleVolume.CHEST);
    // untouched muscle keeps a sane (non-negative) volume
    expect(result.muscleVolume.BICEPS).toBeGreaterThanOrEqual(0);
  });

  it("throws when the distributed session count disagrees with the stored week", () => {
    const spec = resolvedSpec();
    const plan = generateMesocycle(spec, EXERCISE_LIBRARY, DEFAULT_LANDMARKS);
    const upcoming = { ...plan.weeks[2]!, sessions: plan.weeks[2]!.sessions.slice(0, 1) };
    const adj: WeekAdjustment = {
      fromWeekIndex: 2,
      appliesToWeekIndex: 3,
      adjustments: [],
      checkInValue: "low",
      facts: [],
    };
    expect(() => weekPlanFromAdjustment(spec, EXERCISE_LIBRARY, adj, upcoming)).toThrow(/mismatch/i);
  });
});
