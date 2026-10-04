import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "../../../generated/prisma";
import { EXERCISE_LIBRARY } from "~/domain/exercise-library";
import { DEFAULT_LANDMARKS } from "~/domain/landmarks";
import { checkLayout, generateMesocycle, resolveConstraints, type MuscleVolumeMap, type ScheduleInput } from "~/engine";
import { applyWeekPlanToDb } from "./apply-week-plan";
import {
  applyLayoutToDb,
  availabilityFromRows,
  completedPlacement,
  firstOpenDay,
  placePlanWeeks,
  scheduleInputFromDb,
  weekDays,
  type ScheduleSettings,
  type WeekForSchedule,
} from "./schedule-adapters";

const UTC: ScheduleSettings = { mode: "DAY", availability: [], timezone: "UTC" };
const MON = new Date("2026-10-05T00:00:00Z"); // a Monday

function session(over: Partial<WeekForSchedule["sessions"][number]> & { id: string; order: number }) {
  return {
    weekId: "wk",
    splitSlot: "Upper A",
    dayOfWeek: null,
    daypart: null,
    targetDurationMin: 60,
    status: "SCHEDULED" as const,
    completedAt: null,
    prescriptions: [
      {
        id: `p-${over.id}`,
        trainingSessionId: over.id,
        exerciseId: "e1",
        order: 0,
        sets: 4,
        targetRepLow: 6,
        targetRepHigh: 10,
        targetRir: 2,
        exercise: {
          id: "e1",
          name: "Barbell Bench Press",
          movementPattern: "HORIZONTAL_PUSH" as const,
          equipment: "BARBELL" as const,
          contraindications: [],
          createdAt: new Date(),
        },
      },
    ],
    ...over,
  };
}

const week = (index: number, sessions: ReturnType<typeof session>[]): WeekForSchedule => ({
  id: `wk-${index}`,
  mesocycleId: "m",
  index,
  isDeload: false,
  sessions,
});

describe("weekDays / firstOpenDay", () => {
  it("lists seven local dates starting on the block's start weekday", () => {
    const days = weekDays(MON, 2, "UTC");
    expect(days).toHaveLength(7);
    expect(days[0]).toEqual({ date: "2026-10-12", weekday: 0 });
    expect(days[6]).toEqual({ date: "2026-10-18", weekday: 6 });
  });

  // Review Focus 1.
  it("starts the week on the athlete's local weekday", () => {
    const start = new Date("2026-10-06T23:30:00Z"); // Wed in Sydney, Tue in UTC
    expect(weekDays(start, 1, "Australia/Sydney")[0]).toEqual({ date: "2026-10-07", weekday: 2 });
    expect(weekDays(start, 1, "UTC")[0]).toEqual({ date: "2026-10-06", weekday: 1 });
  });

  it("counts elapsed local days into the week and clamps", () => {
    expect(firstOpenDay(MON, 1, "UTC", new Date("2026-10-05T10:00:00Z"))).toBe(0);
    expect(firstOpenDay(MON, 1, "UTC", new Date("2026-10-07T10:00:00Z"))).toBe(2);
    expect(firstOpenDay(MON, 2, "UTC", new Date("2026-10-07T10:00:00Z"))).toBe(0); // future week
    expect(firstOpenDay(MON, 1, "UTC", new Date("2026-11-01T10:00:00Z"))).toBe(7); // long past
  });
});

describe("scheduleInputFromDb", () => {
  const now = new Date("2026-10-07T10:00:00Z");

  it("builds sessions with footprints, placements and locks", () => {
    const w = week(1, [
      session({ id: "a", order: 0, dayOfWeek: 0, status: "COMPLETED", completedAt: MON }),
      session({ id: "b", order: 1 }),
    ]);
    const input = scheduleInputFromDb({ week: w, prevWeek: null, settings: UTC, startDate: MON, now });
    expect(input.mode).toBe("DAY");
    expect(input.weekStartDay).toBe(0);
    expect(input.firstOpenDay).toBe(2);
    expect(input.carryIn).toEqual([]);
    expect(input.sessions).toEqual([
      { id: "a", order: 0, footprint: expect.objectContaining({ CHEST: 4 }) as unknown, locked: true, placement: { day: 0, daypart: null } },
      { id: "b", order: 1, footprint: expect.objectContaining({ CHEST: 4 }) as unknown, locked: false, placement: null },
    ]);
  });

  it("carries in the previous week's placed sessions with their distance to the week start", () => {
    const prev = week(1, [session({ id: "p", order: 0, dayOfWeek: 6 }), session({ id: "q", order: 1 })]);
    const w = week(2, [session({ id: "a", order: 0 })]);
    const input: ScheduleInput = scheduleInputFromDb({ week: w, prevWeek: prev, settings: UTC, startDate: MON, now });
    expect(input.carryIn).toHaveLength(1);
    expect(input.carryIn[0]!.halfDaysBeforeWeekStart).toBe(2); // Sunday, one day before Monday
  });
});

describe("availabilityFromRows / completedPlacement", () => {
  it("renames dayOfWeek to day", () => {
    expect(availabilityFromRows([{ dayOfWeek: 3, daypart: "PM", state: "BLOCKED" }])).toEqual([
      { day: 3, daypart: "PM", state: "BLOCKED" },
    ]);
  });

  it("places a completed session on its local weekday and half", () => {
    const at = new Date("2026-10-06T23:30:00Z"); // Wed 10:30 in Sydney
    expect(completedPlacement(at, "Australia/Sydney", "HALF_DAY")).toEqual({ day: 2, daypart: "AM" });
    expect(completedPlacement(at, "Australia/Sydney", "DAY")).toEqual({ day: 2, daypart: null });
    expect(completedPlacement(at, "UTC", "HALF_DAY")).toEqual({ day: 1, daypart: "PM" });
  });
});

describe("applyLayoutToDb", () => {
  it("writes only the day and daypart of each session", async () => {
    const update = vi.fn().mockResolvedValue({});
    const tx = { trainingSession: { update } } as unknown as Prisma.TransactionClient;
    await applyLayoutToDb(tx, { a: { day: 2, daypart: "PM" }, b: { day: 4, daypart: null } });
    expect(update.mock.calls.map((c) => c[0] as unknown)).toEqual([
      { where: { id: "a" }, data: { dayOfWeek: 2, daypart: "PM" } },
      { where: { id: "b" }, data: { dayOfWeek: 4, daypart: null } },
    ]);
  });
});

describe("applyWeekPlanToDb (existing) keeps placements", () => {
  it("never writes dayOfWeek or daypart when prescriptions are rewritten", async () => {
    const update = vi.fn().mockResolvedValue({});
    const tx = {
      exercise: { findMany: vi.fn().mockResolvedValue([{ id: "e1", name: "Barbell Bench Press" }]) },
      exercisePrescription: { deleteMany: vi.fn().mockResolvedValue({}), createMany: vi.fn().mockResolvedValue({}) },
      trainingSession: { update },
      weekMuscleVolume: { deleteMany: vi.fn().mockResolvedValue({}), createMany: vi.fn().mockResolvedValue({}) },
    } as unknown as Prisma.TransactionClient;
    await applyWeekPlanToDb(tx, "wk-1", {
      index: 1,
      isDeload: false,
      muscleVolume: {} as MuscleVolumeMap,
      sessions: [
        {
          slotId: "a",
          label: "Upper A",
          estimatedMinutes: 55,
          prescriptions: [{ exerciseName: "Barbell Bench Press", sets: 3, repRangeLow: 6, repRangeHigh: 10, targetRir: 2 }],
        },
      ],
    });
    for (const call of update.mock.calls) {
      const data = (call[0] as { data: Record<string, unknown> }).data;
      expect(Object.keys(data)).toEqual(["targetDurationMin"]);
    }
  });
});

describe("placePlanWeeks", () => {
  const spec = resolveConstraints(
    {
      daysPerWeek: 4,
      splitType: "UPPER_LOWER",
      sessionLengthCapMin: 75,
      blockLengthWeeks: 4,
      checkInCadence: "WEEKLY",
      muscleTargets: [],
      excludedExerciseNames: [],
    },
    { experienceLevel: "INTERMEDIATE", phase: "MAINTAIN", landmarks: DEFAULT_LANDMARKS },
  );
  if (spec.kind !== "resolved") throw new Error("fixture constraint set must resolve");
  const plan = generateMesocycle(spec, EXERCISE_LIBRARY, DEFAULT_LANDMARKS);

  it("places every session of every week, keyed by session index", () => {
    const layouts = placePlanWeeks(plan, UTC, MON, MON);
    expect(layouts).toHaveLength(plan.weeks.length);
    layouts.forEach((layout, i) => {
      expect(layout).not.toBeNull();
      expect(Object.keys(layout!).sort()).toEqual(plan.weeks[i]!.sessions.map((_, j) => String(j)));
      const days = Object.values(layout!).map((p) => p.day);
      expect(new Set(days).size).toBe(days.length);
    });
  });

  it("respects blocked days", () => {
    const blocked: ScheduleSettings = {
      ...UTC,
      availability: [
        { day: 5, daypart: "AM", state: "BLOCKED" },
        { day: 5, daypart: "PM", state: "BLOCKED" },
        { day: 6, daypart: "AM", state: "BLOCKED" },
        { day: 6, daypart: "PM", state: "BLOCKED" },
      ],
    };
    for (const layout of placePlanWeeks(plan, blocked, MON, MON)) {
      for (const p of Object.values(layout!)) expect(p.day).toBeLessThan(5);
    }
  });

  // Review Focus 3.
  it("returns null for a week that cannot be placed, without throwing", () => {
    const allBlocked: ScheduleSettings = {
      ...UTC,
      availability: [0, 1, 2, 3, 4, 5, 6].flatMap((day) => [
        { day, daypart: "AM" as const, state: "BLOCKED" as const },
        { day, daypart: "PM" as const, state: "BLOCKED" as const },
      ]),
    };
    expect(placePlanWeeks(plan, allBlocked, MON, MON).every((l) => l === null)).toBe(true);
  });

  it("produces layouts the hard rules accept", () => {
    const layouts = placePlanWeeks(plan, UTC, MON, MON);
    const first = layouts[0]!;
    const input: ScheduleInput = {
      mode: "DAY",
      weekStartDay: 0,
      firstOpenDay: 0,
      availability: [],
      carryIn: [],
      sessions: Object.keys(first).map((id, order) => ({ id, order, footprint: {}, locked: false, placement: null })),
    };
    expect(checkLayout(input, first)).toEqual([]);
  });
});
