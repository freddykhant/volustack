// src/server/api/routers/checkin.test.ts
//
// Fix round 1 (Task 9 review): applyProgression no longer calls the model — it replays
// the verdicts persisted in the PROGRESS DecisionLog's payload at submit time. These
// tests exercise that path end-to-end through the real router (not just a helper),
// with a fabricated ambiguous muscle (QUADS, cause "on_track") so that a regression
// reintroducing a model call inside applyProgression would have a real question to ask
// and would be caught by the "does not call the model" assertion below.
//
// Fix round 2: the atomic claim inside applyProgression's transaction now pins
// `id: pending.id`, not just (mesocycleId, weekIndex, type, status) — otherwise a
// concurrent resubmission that replaces the PROPOSED row between the outer payload
// read and the inner claim would flip the NEWER row to APPLIED while applying the
// OLDER row's (now-stale) verdicts. The "stale proposal replaced mid-request" test
// below models the two rows explicitly so the assertion is sensitive to whether the
// where-clause actually filters by id, not just to the claimed count in isolation.
import { describe, expect, it, vi } from "vitest";
import { EXERCISE_LIBRARY } from "~/domain/exercise-library";
import { createCallerFactory } from "~/server/api/trpc";
import type * as ExecuteModule from "~/server/judgement/execute";

vi.mock("~/server/judgement/execute", async (importOriginal) => {
  const actual = await importOriginal<typeof ExecuteModule>();
  // Defaults to resolving [] (same shape as a real cache-miss-then-fallback outcome)
  // rather than `undefined`, so that IF a regression reintroduces a model call inside
  // applyProgression, execution proceeds normally all the way to the "never calls the
  // model" test's own assertion instead of crashing on `verdicts` being `undefined`
  // partway through `applyProgressionVerdicts` — the named assertion is the thing that
  // must fail, not an unrelated TypeError upstream of it.
  return { ...actual, executeJudgement: vi.fn().mockResolvedValue([]) };
});

const { executeJudgement } = await import("~/server/judgement/execute");
const { checkinRouter } = await import("./checkin");

const createCaller = createCallerFactory(checkinRouter);

/** A 2-week mesocycle: week 1 (current, resolved via a prior check-in) and week 2
 * (upcoming, non-deload — needed so QUADS lands on the ambiguous "on_track" cause;
 * stepWeek forces "default_progression" for every muscle whenever the upcoming week
 * is a deload or absent, so there would be nothing to ask about otherwise). Week 1 has
 * no sessions, so `derivePerformance` returns undefined for every muscle — combined
 * with recovery=2 (above RECOVERY_LOW) and joint=0 (below JOINT_PAIN) for QUADS, that
 * lands QUADS on "on_track", which `isAmbiguous` treats as judgeable. Week 2 carries
 * exactly 4 sessions (order 0-3) because `weekPlanFromAdjustment` rebuilds the week from
 * `buildSessionSlots("UPPER_LOWER", 4)`, which yields exactly 4 slots, and throws if the
 * stored week's session count doesn't match. */
function makeMesocycle() {
  return {
    id: "meso-1",
    constraintSetId: "cs-1",
    athleteProfile: { experience: "INTERMEDIATE" as const, phase: "MAINTAIN" as const },
    weeks: [
      { id: "week-1", mesocycleId: "meso-1", index: 1, isDeload: false, muscleVolumes: [], sessions: [], checkIns: [] },
      {
        id: "week-2", mesocycleId: "meso-1", index: 2, isDeload: false, muscleVolumes: [],
        sessions: [0, 1, 2, 3].map((order) => ({
          id: `sess-2-${order}`, weekId: "week-2", order, splitSlot: `Slot ${order}`,
          dayOfWeek: null, status: "SCHEDULED" as const, completedAt: null, targetDurationMin: 60,
          prescriptions: [],
        })),
        checkIns: [],
      },
    ],
  };
}

/** Same constraint set shape as `reschedule-adapters.test.ts`'s `makeCs` — known to
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

function makeTx() {
  return {
    decisionLog: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    trainingSession: {
      count: vi.fn().mockResolvedValue(4),
      update: vi.fn().mockResolvedValue({}),
    },
    exercise: {
      findMany: vi.fn().mockResolvedValue(EXERCISE_LIBRARY.map((e, i) => ({ id: `ex-${i}`, name: e.name }))),
    },
    exercisePrescription: {
      deleteMany: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({}),
    },
    weekMuscleVolume: {
      deleteMany: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({}),
    },
  };
}

/** Builds a fake `db` + caller for `applyProgression`, with a pending PROGRESS proposal
 * whose payload is the caller-supplied shape — standing in for whatever was persisted by
 * `submitWeeklyCheckIn` (deliberately missing/malformed `verdicts` in the tests below). */
/** Minimal `BLOCK_FOR_READINESS_SELECT`-shaped block, empty enough that
 * `readinessSamplesFrom`/`recoveryByWeekFromBlock` degrade to "not enough data"
 * (`[]` / empty map) rather than throwing. Only needed so that IF a regression
 * reintroduces a `progressionVerdicts` call inside `applyProgression`, it reaches
 * the mocked `executeJudgement` instead of blowing up on a missing db method first —
 * see the "never calls the model" test below, and the Fix-round-2 note on why that
 * distinction matters. */
function makeReadinessBlock() {
  return {
    startDate: new Date("2026-01-01"), lengthWeeks: 2,
    weeks: [
      { index: 1, sessions: [], checkIns: [] },
      { index: 2, sessions: [], checkIns: [] },
    ],
  };
}

function makeCaller(pendingPayload: unknown, pendingId = "dl-1") {
  const tx = makeTx();
  const db = {
    mesocycle: {
      findFirst: vi.fn().mockResolvedValue(makeMesocycle()),
      findUniqueOrThrow: vi.fn().mockResolvedValue(makeReadinessBlock()),
    },
    constraintSet: { findUniqueOrThrow: vi.fn().mockResolvedValue(makeCs()) },
    decisionLog: { findFirst: vi.fn().mockResolvedValue({ id: pendingId, payload: pendingPayload }) },
    checkIn: {
      findFirst: vi.fn().mockResolvedValue({
        muscleFeedback: [{ muscle: "QUADS", recovery: 2, jointStress: 0 }],
      }),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => fn(tx)),
  };
  const caller = createCaller({
    db,
    session: { user: { id: "user-1" } },
  } as unknown as Parameters<typeof createCaller>[0]);
  return { caller, db, tx };
}

describe("applyProgression — Fix round 1 (structural replay, no model call at accept)", () => {
  it("degrades to the deterministic proposal when the payload has no verdicts key", async () => {
    const { caller } = makeCaller({ adjustments: [], checkInValue: "low", facts: [] });
    const result = await caller.applyProgression({ weekIndex: 1 });
    expect(result.appliesToWeekIndex).toBe(2);
  });

  it("degrades to the deterministic proposal when verdicts is malformed, without throwing", async () => {
    const { caller } = makeCaller({
      adjustments: [], checkInValue: "low", facts: [],
      verdicts: [{ id: "responds_well_QUADS", kind: "noul" }], // missing `noul`, fails the schema
    });
    const result = await caller.applyProgression({ weekIndex: 1 });
    expect(result.appliesToWeekIndex).toBe(2);
  });

  it("never calls the model on the apply path, even with an ambiguous muscle to ask about", async () => {
    vi.mocked(executeJudgement).mockClear();
    const { caller } = makeCaller({ adjustments: [], checkInValue: "low", facts: [] });
    await caller.applyProgression({ weekIndex: 1 });
    expect(executeJudgement).not.toHaveBeenCalled();
  });
});

describe("applyProgression — Fix round 2 (claim pinned to the row the payload came from)", () => {
  /** Models the race directly instead of just stubbing a return value: `rows` is the
   * ACTUAL current DecisionLog state (one row, id "dl-2", PROPOSED) — standing in for a
   * resubmission that deleted "dl-1" (what the outer `pending` read saw, with the stale
   * payload) and created "dl-2" between that read and this transaction's claim.
   * `updateMany`'s matcher replicates Prisma's where-clause semantics: a field is only
   * a filter if present in `where`. That makes this test sensitive to whether the
   * production code's where-clause includes `id` at all — not just to a canned
   * `{ count: 0 }` return — so it actually fails if `id: pending.id` is removed. */
  function makeStaleRowCaller() {
    const rows = [
      { id: "dl-2", mesocycleId: "meso-1", weekIndex: 1, type: "PROGRESS", status: "PROPOSED" as string },
    ];
    const tx = makeTx();
    tx.decisionLog.updateMany = vi.fn((args: {
      where: { id?: string; mesocycleId: string; weekIndex: number; type: string; status: string };
    }) => {
      const match = rows.find((r) =>
        r.status === args.where.status &&
        r.mesocycleId === args.where.mesocycleId &&
        r.weekIndex === args.where.weekIndex &&
        r.type === args.where.type &&
        (args.where.id === undefined || args.where.id === r.id),
      );
      if (!match) return Promise.resolve({ count: 0 });
      match.status = "APPLIED";
      return Promise.resolve({ count: 1 });
    });
    const db = {
      mesocycle: {
        findFirst: vi.fn().mockResolvedValue(makeMesocycle()),
        findUniqueOrThrow: vi.fn().mockResolvedValue(makeReadinessBlock()),
      },
      constraintSet: { findUniqueOrThrow: vi.fn().mockResolvedValue(makeCs()) },
      // The outer read sees the STALE snapshot: id "dl-1", which no longer exists in
      // `rows` by the time the transaction's claim runs.
      decisionLog: { findFirst: vi.fn().mockResolvedValue({ id: "dl-1", payload: { adjustments: [], checkInValue: "low", facts: [] } }) },
      checkIn: {
        findFirst: vi.fn().mockResolvedValue({
          muscleFeedback: [{ muscle: "QUADS", recovery: 2, jointStress: 0 }],
        }),
      },
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => fn(tx)),
    };
    const caller = createCaller({
      db,
      session: { user: { id: "user-1" } },
    } as unknown as Parameters<typeof createCaller>[0]);
    return { caller, tx };
  }

  it("rejects as a CONFLICT and writes no plan when the claimed row was replaced mid-request", async () => {
    const { caller, tx } = makeStaleRowCaller();
    await expect(caller.applyProgression({ weekIndex: 1 })).rejects.toThrow(/already applied or withdrawn|refresh/);
    expect(tx.trainingSession.count).not.toHaveBeenCalled();
    expect(tx.exercise.findMany).not.toHaveBeenCalled();
  });
});
