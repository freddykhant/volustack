import { describe, expect, it } from "vitest";
import { DEFAULT_LANDMARKS } from "~/domain/landmarks";
import type { WeekForPlan, ConstraintSetWithTargets } from "./reschedule-adapters";
import { adaptationContextFrom, constraintSetInputFromRow, weekPlanFromDb } from "./reschedule-adapters";

function makeWeek(): WeekForPlan {
  return {
    id: "wk1", mesocycleId: "m1", index: 2, isDeload: false,
    muscleVolumes: [
      { id: "v1", weekId: "wk1", muscle: "CHEST", plannedSets: 10 },
      { id: "v2", weekId: "wk1", muscle: "QUADS", plannedSets: 12 },
    ],
    sessions: [
      {
        id: "sB", weekId: "wk1", order: 1, splitSlot: "Lower A", dayOfWeek: null,
        targetDurationMin: 50, status: "SCHEDULED", completedAt: null,
        prescriptions: [
          { id: "p2", trainingSessionId: "sB", exerciseId: "eLP", order: 0, sets: 4, targetRepLow: 6, targetRepHigh: 10, targetRir: 2,
            exercise: { id: "eLP", name: "Leg Press", movementPattern: "SQUAT", equipment: "MACHINE", contraindications: [] } },
        ],
      },
      {
        id: "sA", weekId: "wk1", order: 0, splitSlot: "Upper A", dayOfWeek: 0,
        targetDurationMin: 58, status: "SCHEDULED", completedAt: null,
        prescriptions: [
          { id: "p1", trainingSessionId: "sA", exerciseId: "eBP", order: 0, sets: 3, targetRepLow: 6, targetRepHigh: 10, targetRir: 2,
            exercise: { id: "eBP", name: "Barbell Bench Press", movementPattern: "HORIZONTAL_PUSH", equipment: "BARBELL", contraindications: [] } },
        ],
      },
    ],
  } as unknown as WeekForPlan;
}

function makeCs(): ConstraintSetWithTargets {
  return {
    id: "cs1", athleteProfileId: "ap1", version: 1, isActive: true,
    daysPerWeek: 4, splitType: "UPPER_LOWER", sessionLengthCapMin: 75,
    blockLengthWeeks: 6, deloadWeekIndex: 6, checkInCadence: "WEEKLY", createdAt: new Date(),
    muscleTargets: [
      { id: "t1", constraintSetId: "cs1", muscle: "SIDE_DELTS", weeklySetTarget: null, priority: 3 },
    ],
  } as unknown as ConstraintSetWithTargets;
}

describe("weekPlanFromDb", () => {
  it("maps a persisted week to an engine WeekPlan (slotId=session id, sorted, full volume map)", () => {
    const wp = weekPlanFromDb(makeWeek());
    expect(wp.index).toBe(2);
    expect(wp.isDeload).toBe(false);
    expect(wp.sessions.map((s) => s.slotId)).toEqual(["sA", "sB"]); // sorted by order
    expect(wp.sessions[0]!.prescriptions[0]!.exerciseName).toBe("Barbell Bench Press");
    expect(wp.muscleVolume.CHEST).toBe(10);
    expect(wp.muscleVolume.BICEPS).toBe(0); // muscles with no row default to 0
  });
});

describe("constraintSetInputFromRow", () => {
  it("maps a stored constraint set to a ConstraintSetInput", () => {
    const input = constraintSetInputFromRow(makeCs());
    expect(input.daysPerWeek).toBe(4);
    expect(input.muscleTargets).toEqual([{ muscle: "SIDE_DELTS", weeklySetTarget: undefined, priority: 3 }]);
    expect(input.excludedExerciseNames).toEqual([]);
  });
});

describe("adaptationContextFrom", () => {
  it("resolves the stored set into an AdaptationContext", () => {
    const ctx = adaptationContextFrom(makeCs(), { experienceLevel: "INTERMEDIATE", phase: "MAINTAIN", landmarks: DEFAULT_LANDMARKS });
    expect(ctx.splitType).toBe("UPPER_LOWER");
    expect(ctx.daysPerWeek).toBe(4);
    expect(ctx.isBeginner).toBe(false);
    expect(ctx.targets.length).toBeGreaterThan(0);
    expect(ctx.library.length).toBeGreaterThan(0);
  });
});
