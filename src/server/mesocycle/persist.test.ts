import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "../../../generated/prisma";
import { EXERCISE_LIBRARY } from "~/domain/exercise-library";
import { DEFAULT_LANDMARKS } from "~/domain/landmarks";
import { generateMesocycle, resolveConstraints } from "~/engine";
import { persistMesocyclePlan } from "./persist";

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

type SessionCreate = { order: number; dayOfWeek: number | null; daypart: "AM" | "PM" | null; prescriptions: unknown };

function fakeTx() {
  const weekCreate = vi.fn().mockResolvedValue({});
  const logCreateMany = vi.fn().mockResolvedValue({});
  const tx = {
    exercise: { findMany: vi.fn().mockResolvedValue(EXERCISE_LIBRARY.map((e, i) => ({ id: `e${i}`, name: e.name }))) },
    mesocycle: { create: vi.fn().mockResolvedValue({ id: "meso-1" }) },
    week: { create: weekCreate },
    decisionLog: { createMany: logCreateMany },
  } as unknown as Prisma.TransactionClient;
  const sessionsOf = (call: number): SessionCreate[] =>
    (weekCreate.mock.calls[call]![0] as { data: { sessions: { create: SessionCreate[] } } }).data.sessions.create;
  return { tx, weekCreate, logCreateMany, sessionsOf };
}

const base = { athleteProfileId: "ap", constraintSetId: "cs", plan, startDate: new Date("2026-10-05T00:00:00Z"), name: "Block 1" };

describe("persistMesocyclePlan — placement", () => {
  it("writes a distinct day for every session with default settings", async () => {
    const { tx, sessionsOf } = fakeTx();
    await persistMesocyclePlan(tx, base);
    const sessions = sessionsOf(0);
    expect(sessions.every((s) => s.dayOfWeek !== null && s.daypart === null)).toBe(true);
    expect(new Set(sessions.map((s) => s.dayOfWeek)).size).toBe(sessions.length);
  });

  it("writes dayparts in HALF_DAY mode", async () => {
    const { tx, sessionsOf } = fakeTx();
    await persistMesocyclePlan(tx, { ...base, schedule: { mode: "HALF_DAY", availability: [], timezone: "UTC" } });
    expect(sessionsOf(0).every((s) => s.daypart === "AM" || s.daypart === "PM")).toBe(true);
  });

  it("leaves prescriptions exactly as the plan has them (Law 1)", async () => {
    const { tx, sessionsOf } = fakeTx();
    await persistMesocyclePlan(tx, base);
    const written = sessionsOf(0).map(
      (s) => (s.prescriptions as { create: { sets: number }[] }).create.map((p) => p.sets),
    );
    expect(written).toEqual(plan.weeks[0]!.sessions.map((s) => s.prescriptions.map((p) => p.sets)));
  });

  // No open cell anywhere: the block is still created, with its sessions unplaced.
  it("still creates the block, unplaced, when availability leaves no open cell", async () => {
    const { tx, sessionsOf, logCreateMany } = fakeTx();
    const availability = [0, 1, 2, 3, 4, 5, 6].flatMap((day) => [
      { day, daypart: "AM" as const, state: "BLOCKED" as const },
      { day, daypart: "PM" as const, state: "BLOCKED" as const },
    ]);
    const res = await persistMesocyclePlan(tx, { ...base, schedule: { mode: "DAY", availability, timezone: "UTC" } });
    expect(res.weeks).toBe(plan.weeks.length);
    expect(sessionsOf(0).every((s) => s.dayOfWeek === null)).toBe(true);
    const logged = logCreateMany.mock.calls.flatMap((c) => (c[0] as { data: { type: string }[] }).data);
    expect(logged.some((d) => d.type === "SCHEDULE")).toBe(true);
  });
});
