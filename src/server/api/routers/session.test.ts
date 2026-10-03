// src/server/api/routers/session.test.ts
//
// Finding 3 (final whole-branch review, 2026-10-01 jev-judgement-foundation spec):
// getRescheduleOptions gained an unguarded `mesocycle.findUniqueOrThrow` for the
// readiness fetch feeding the judgement layer. If it rejects, the whole query used to
// fail — so a previously-working path (the deterministic reschedule options) hard-failed
// because of a layer that is supposed to be best-effort. The fix wraps the readiness
// fetch AND the executeJudgement call in one try/catch that degrades to `verdicts = []`,
// matching the design's rule that every judgement failure mode falls back silently
// (spec §9.1) rather than failing the caller.
import { describe, expect, it, vi } from "vitest";
import { createCallerFactory } from "~/server/api/trpc";
import type * as ExecuteModule from "~/server/judgement/execute";

vi.mock("~/server/judgement/execute", async (importOriginal) => {
  const actual = await importOriginal<typeof ExecuteModule>();
  return { ...actual, executeJudgement: vi.fn().mockResolvedValue([]) };
});

const { executeJudgement } = await import("~/server/judgement/execute");
const { sessionRouter } = await import("./session");

const createCaller = createCallerFactory(sessionRouter);

/** One SCHEDULED session ("sess-1") in a 2-day UPPER_LOWER week, carrying a single
 * Bench Press prescription — matches EXERCISE_LIBRARY's "Barbell Bench Press" so
 * `redistributeWeek`'s primary-muscle lookup resolves. Shaped like
 * `WEEK_FOR_PLAN_INCLUDE`'s payload (mirrors reschedule-adapters.test.ts's fixture). */
function makeWeek() {
  return {
    id: "wk-1", mesocycleId: "meso-1", index: 2, isDeload: false,
    muscleVolumes: [{ id: "v1", weekId: "wk-1", muscle: "CHEST", plannedSets: 10 }],
    sessions: [
      {
        id: "sess-1", weekId: "wk-1", order: 0, splitSlot: "Upper A", dayOfWeek: 0,
        targetDurationMin: 58, status: "SCHEDULED", completedAt: null,
        prescriptions: [
          {
            id: "p1", trainingSessionId: "sess-1", exerciseId: "eBP", order: 0,
            sets: 3, targetRepLow: 6, targetRepHigh: 10, targetRir: 2,
            exercise: { id: "eBP", name: "Barbell Bench Press", movementPattern: "HORIZONTAL_PUSH", equipment: "BARBELL", contraindications: [] },
          },
        ],
      },
    ],
  };
}

/** Same constraint set shape as reschedule-adapters.test.ts's makeCs — known to
 * resolve (UPPER_LOWER, 4 days/week, 75min cap is feasible at default landmarks). */
function makeCs() {
  return {
    id: "cs-1", athleteProfileId: "ap1", version: 1, isActive: true,
    daysPerWeek: 4, splitType: "UPPER_LOWER" as const, sessionLengthCapMin: 75,
    blockLengthWeeks: 6, deloadWeekIndex: 6, checkInCadence: "WEEKLY" as const, createdAt: new Date(),
    muscleTargets: [
      { id: "t1", constraintSetId: "cs-1", muscle: "SIDE_DELTS" as const, weeklySetTarget: null, priority: 3 },
    ],
  };
}

function makeDb(opts: { readinessFetch: "resolves" | "rejects" }) {
  return {
    trainingSession: {
      findFirst: vi.fn().mockResolvedValue({
        id: "sess-1", status: "SCHEDULED",
        week: {
          id: "wk-1", index: 2, mesocycleId: "meso-1",
          mesocycle: {
            constraintSetId: "cs-1",
            athleteProfile: { experience: "INTERMEDIATE" as const, phase: "MAINTAIN" as const },
          },
        },
      }),
    },
    week: { findUniqueOrThrow: vi.fn().mockResolvedValue(makeWeek()) },
    constraintSet: { findUniqueOrThrow: vi.fn().mockResolvedValue(makeCs()) },
    mesocycle: {
      findUniqueOrThrow:
        opts.readinessFetch === "rejects"
          ? vi.fn().mockRejectedValue(new Error("readiness fetch boom"))
          : vi.fn().mockResolvedValue({ startDate: new Date("2026-01-01"), lengthWeeks: 2, weeks: [] }),
    },
  };
}

function makeCaller(opts: { readinessFetch: "resolves" | "rejects" }) {
  const db = makeDb(opts);
  const caller = createCaller({
    db,
    session: { user: { id: "user-1" } },
  } as unknown as Parameters<typeof createCaller>[0]);
  return { caller, db };
}

describe("getRescheduleOptions — Finding 3 (readiness fetch failure degrades silently)", () => {
  it("still returns the deterministic option views when the readiness fetch rejects", async () => {
    const { caller } = makeCaller({ readinessFetch: "rejects" });
    const views = await caller.getRescheduleOptions({ sessionId: "sess-1" });
    expect(views.length).toBeGreaterThan(0);
    expect(views.some((v) => v.kind === "LET_GO")).toBe(true);
  });

  it("never lets the readiness-fetch rejection propagate out of the query", async () => {
    const { caller } = makeCaller({ readinessFetch: "rejects" });
    await expect(caller.getRescheduleOptions({ sessionId: "sess-1" })).resolves.toBeDefined();
  });

  it("still returns the same shape of result when the readiness fetch succeeds", async () => {
    vi.mocked(executeJudgement).mockClear();
    const { caller } = makeCaller({ readinessFetch: "resolves" });
    const views = await caller.getRescheduleOptions({ sessionId: "sess-1" });
    expect(views.length).toBeGreaterThan(0);
  });
});
