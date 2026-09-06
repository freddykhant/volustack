import { describe, expect, it } from "vitest";
import type { MesocycleWithRelations } from "./to-mesocycle-view";
import { currentWeekIndex, toMesocycleView } from "./to-mesocycle-view";

const DAY_MS = 24 * 60 * 60 * 1000;

// A minimal but structurally complete Mesocycle payload builder.
function makeMesocycle(over: Partial<{
  startDate: Date | null;
  lengthWeeks: number;
  splitType: MesocycleWithRelations["constraintSet"]["splitType"];
  deloadIndex: number | null; // which week has isDeload=true
  csDeloadWeekIndex: number | null;
}> = {}): MesocycleWithRelations {
  const lengthWeeks = over.lengthWeeks ?? 6;
  const deloadIndex = over.deloadIndex === undefined ? 6 : over.deloadIndex;
  const weeks = Array.from({ length: lengthWeeks }, (_, i) => {
    const index = i + 1;
    return {
      id: `week-${index}`,
      mesocycleId: "meso-1",
      index,
      isDeload: index === deloadIndex,
      muscleVolumes: [
        { id: `wmv-${index}-quads`, weekId: `week-${index}`, muscle: "QUADS" as const, plannedSets: 12 },
        { id: `wmv-${index}-chest`, weekId: `week-${index}`, muscle: "CHEST" as const, plannedSets: 10 },
      ],
      sessions: [
        {
          id: `sess-${index}-b`,
          weekId: `week-${index}`,
          order: 1,
          splitSlot: "Lower A",
          dayOfWeek: null,
          targetDurationMin: 46,
          prescriptions: [
            {
              id: `rx-${index}-legpress`,
              trainingSessionId: `sess-${index}-b`,
              exerciseId: "ex-legpress",
              order: 0,
              sets: 4,
              targetRepLow: 6,
              targetRepHigh: 10,
              targetRir: 2,
              exercise: {
                id: "ex-legpress",
                name: "Leg Press",
                muscles: [
                  { id: "em-1", exerciseId: "ex-legpress", muscle: "QUADS" as const, role: "PRIMARY" as const, fraction: 1 },
                ],
              },
            },
          ],
        },
        {
          id: `sess-${index}-a`,
          weekId: `week-${index}`,
          order: 0,
          splitSlot: "Upper A",
          dayOfWeek: 0,
          targetDurationMin: 58,
          prescriptions: [
            {
              id: `rx-${index}-bench`,
              trainingSessionId: `sess-${index}-a`,
              exerciseId: "ex-bench",
              order: 0,
              sets: 3,
              targetRepLow: 6,
              targetRepHigh: 10,
              targetRir: 2,
              exercise: {
                id: "ex-bench",
                name: "Barbell Bench Press",
                muscles: [
                  { id: "em-2", exerciseId: "ex-bench", muscle: "CHEST" as const, role: "PRIMARY" as const, fraction: 1 },
                  { id: "em-3", exerciseId: "ex-bench", muscle: "TRICEPS" as const, role: "SECONDARY" as const, fraction: 0.5 },
                ],
              },
            },
          ],
        },
      ],
    };
  });

  return {
    id: "meso-1",
    athleteProfileId: "ap-1",
    constraintSetId: "cs-1",
    name: "Test Block",
    status: "ACTIVE",
    startDate: over.startDate === undefined ? new Date(Date.now() - 14 * DAY_MS) : over.startDate,
    lengthWeeks,
    createdAt: new Date(),
    constraintSet: {
      id: "cs-1",
      athleteProfileId: "ap-1",
      version: 1,
      isActive: true,
      daysPerWeek: 5,
      splitType: over.splitType ?? "UPPER_LOWER",
      sessionLengthCapMin: 75,
      blockLengthWeeks: lengthWeeks,
      deloadWeekIndex: over.csDeloadWeekIndex === undefined ? 6 : over.csDeloadWeekIndex,
      checkInCadence: "WEEKLY",
      createdAt: new Date(),
      muscleTargets: [
        { id: "mt-1", constraintSetId: "cs-1", muscle: "SIDE_DELTS" as const, weeklySetTarget: null, priority: 3 },
        { id: "mt-2", constraintSetId: "cs-1", muscle: "CHEST" as const, weeklySetTarget: null, priority: 0 },
      ],
    },
    weeks,
  } as MesocycleWithRelations;
}

describe("currentWeekIndex", () => {
  it("returns 1 when there is no startDate", () => {
    expect(currentWeekIndex(null, 6)).toBe(1);
  });
  it("derives week 3 from a startDate 14 days ago", () => {
    const start = new Date(Date.now() - 14 * DAY_MS);
    expect(currentWeekIndex(start, 6)).toBe(3);
  });
  it("clamps to lengthWeeks when the block is long past", () => {
    const start = new Date(Date.now() - 100 * DAY_MS);
    expect(currentWeekIndex(start, 6)).toBe(6);
  });
  it("clamps to 1 for a future startDate", () => {
    const start = new Date(Date.now() + 100 * DAY_MS);
    expect(currentWeekIndex(start, 6)).toBe(1);
  });
});

describe("toMesocycleView", () => {
  it("maps splitType to a human label", () => {
    expect(toMesocycleView(makeMesocycle({ splitType: "PUSH_PULL_LEGS" })).splitLabel).toBe("Push/Pull/Legs");
    expect(toMesocycleView(makeMesocycle({ splitType: "UPPER_LOWER" })).splitLabel).toBe("Upper/Lower");
  });

  it("takes deloadWeekIndex from the week flagged isDeload", () => {
    expect(toMesocycleView(makeMesocycle({ deloadIndex: 4 })).deloadWeekIndex).toBe(4);
  });

  it("falls back to the constraint set's deloadWeekIndex when no week is flagged", () => {
    const v = toMesocycleView(makeMesocycle({ deloadIndex: null, csDeloadWeekIndex: 5 }));
    expect(v.deloadWeekIndex).toBe(5);
  });

  it("orders muscles by the MuscleGroup enum, not insertion order", () => {
    // fixture inserts QUADS before CHEST; enum order puts CHEST first
    expect(toMesocycleView(makeMesocycle()).muscles).toEqual(["CHEST", "QUADS"]);
  });

  it("lists only priority muscles (priority > 0), in enum order", () => {
    expect(toMesocycleView(makeMesocycle()).priorityMuscles).toEqual(["SIDE_DELTS"]);
  });

  it("marks the current week with isCurrent", () => {
    const v = toMesocycleView(makeMesocycle()); // startDate 14d ago → week 3
    expect(v.currentWeekIndex).toBe(3);
    expect(v.weeks.find((w) => w.index === 3)?.isCurrent).toBe(true);
    expect(v.weeks.filter((w) => w.isCurrent)).toHaveLength(1);
  });

  it("sorts weeks, sessions, and prescriptions deterministically", () => {
    const v = toMesocycleView(makeMesocycle());
    expect(v.weeks.map((w) => w.index)).toEqual([1, 2, 3, 4, 5, 6]);
    // session order 0 ('Upper A') must precede order 1 ('Lower A')
    expect(v.weeks[0]!.sessions.map((s) => s.label)).toEqual(["Upper A", "Lower A"]);
  });

  it("derives muscle chips from the exercise's muscle rows", () => {
    const bench = toMesocycleView(makeMesocycle()).weeks[0]!.sessions[0]!.prescriptions[0]!;
    expect(bench.exerciseName).toBe("Barbell Bench Press");
    expect(bench.muscles).toEqual([
      { muscle: "CHEST", role: "PRIMARY", fraction: 1 },
      { muscle: "TRICEPS", role: "SECONDARY", fraction: 0.5 },
    ]);
  });

  it("maps a session's dayOfWeek to a day tag, undefined when null", () => {
    const week = toMesocycleView(makeMesocycle()).weeks[0]!;
    expect(week.sessions[0]!.dayTag).toBe("Mon"); // dayOfWeek 0
    expect(week.sessions[1]!.dayTag).toBeUndefined(); // dayOfWeek null
  });

  it("builds week cells with landmarks from DEFAULT_LANDMARKS", () => {
    const cell = toMesocycleView(makeMesocycle()).weeks[0]!.cells.find((c) => c.muscle === "CHEST")!;
    expect(cell.plannedSets).toBe(10);
    expect(cell.mev).toBe(8); // DEFAULT_LANDMARKS.CHEST.mev
    expect(cell.mrv).toBe(22);
  });

  it("returns empty coachNotes and omits swapOptions (deferred)", () => {
    const v = toMesocycleView(makeMesocycle());
    expect(v.coachNotes).toEqual([]);
    expect(v.weeks[0]!.sessions[0]!.swapOptions).toBeUndefined();
  });
});
