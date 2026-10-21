import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type * as EngineModule from "~/engine";
import { createCallerFactory } from "~/server/api/trpc";
import type * as ExecuteModule from "~/server/judgement/execute";
import { scheduleRouter } from "./schedule";

// The real engine, with `checkLayout` wrapped so one test can make it report a violation.
vi.mock("~/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof EngineModule>();
  return { ...actual, checkLayout: vi.fn(actual.checkLayout) };
});
import { checkLayout } from "~/engine";

vi.mock("~/server/judgement/execute", async (importOriginal) => {
  const actual = await importOriginal<typeof ExecuteModule>();
  return { ...actual, executeJudgement: vi.fn().mockResolvedValue([]) };
});
import { executeJudgement } from "~/server/judgement/execute";

const createCaller = createCallerFactory(scheduleRouter);

// Wednesday 7 Oct 2026 (UTC). The block started Monday 5 Oct, so week 1 runs Mon…Sun
// and Monday and Tuesday are already in the past (firstOpenDay = 2).
const NOW = new Date("2026-10-07T02:00:00Z");
const START = new Date("2026-10-05T00:00:00Z");

// Fake only Date: tRPC's dev timing middleware awaits a real setTimeout.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterAll(() => {
  vi.useRealTimers();
});
// A verdict or violation set by one test must never reach the next, even when that test
// fails half-way.
afterEach(() => {
  vi.mocked(executeJudgement).mockReset();
  vi.mocked(executeJudgement).mockResolvedValue([]);
  vi.mocked(checkLayout).mockReset();
});

type Status = "SCHEDULED" | "COMPLETED" | "MISSED";

function sessionRow(id: string, weekId: string, order: number, label: string, dayOfWeek: number | null, status: Status = "SCHEDULED") {
  return {
    id,
    weekId,
    order,
    splitSlot: label,
    dayOfWeek,
    daypart: null,
    targetDurationMin: 60,
    status,
    completedAt: status === "COMPLETED" ? START : null,
    prescriptions: [
      {
        id: `p-${id}`,
        trainingSessionId: id,
        exerciseId: "e1",
        order: 0,
        sets: 4,
        targetRepLow: 6,
        targetRepHigh: 10,
        targetRir: 2,
        exercise: { id: "e1", name: "Barbell Bench Press", movementPattern: "HORIZONTAL_PUSH", equipment: "BARBELL", contraindications: [] },
      },
    ],
  };
}

function weekRow(index: number, sessions: ReturnType<typeof sessionRow>[]) {
  return { id: `wk-${index}`, mesocycleId: "meso-1", index, isDeload: false, sessions };
}

interface Opts {
  noBlock?: boolean;
  week1?: ReturnType<typeof sessionRow>[];
  laterWeeks?: ReturnType<typeof weekRow>[];
  availability?: { dayOfWeek: number; daypart: "AM" | "PM"; state: "PREFERRED" | "BLOCKED" }[];
  dismissed?: { payload: unknown }[];
  /** Rows the guarded (status = SCHEDULED) update reports per session; default 1. */
  writeCount?: number;
  noLock?: boolean;
  /** The athlete's calendar zone (default UTC) and when the block started (default Mon 5 Oct 00:00Z). */
  timezone?: string;
  startDate?: Date;
  /** Every week of the block that the query should be able to find (default: week 1 only). */
  weeks?: ReturnType<typeof weekRow>[];
  /** One-off blocked time on the athlete's profile. */
  exceptions?: { date: Date; daypart: "AM" | "PM" }[];
  scheduleMode?: "DAY" | "HALF_DAY";
}

function makeCaller(opts: Opts = {}) {
  const week1 = opts.week1 ?? [sessionRow("s1", "wk-1", 0, "Upper A", 3), sessionRow("s2", "wk-1", 1, "Upper B", 5)];
  const meso = {
    id: "meso-1",
    startDate: opts.startDate ?? START,
    lengthWeeks: 4,
    athleteProfile: {
      id: "profile-1",
      scheduleMode: opts.scheduleMode ?? "DAY",
      timezone: opts.timezone ?? "UTC",
      availability: opts.availability ?? [],
      availabilityExceptions: opts.exceptions ?? [],
    },
    weeks: opts.weeks ?? [weekRow(1, week1)],
  };
  const db = {
    mesocycle: { findFirst: vi.fn().mockResolvedValue(opts.noBlock ? null : meso) },
    week: { findMany: vi.fn().mockResolvedValue(opts.laterWeeks ?? []) },
    trainingSession: {
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: opts.writeCount ?? 1 }),
    },
    availabilityException: {
      createMany: vi.fn().mockResolvedValue({ count: 2 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
      findMany: vi.fn().mockResolvedValue(opts.exceptions ?? []),
    },
    decisionLog: {
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue(opts.dismissed ?? []),
    },
    // Outside activities are cues only: any scheduling code that reaches for them fails loudly.
    outsideActivity: Object.fromEntries(
      ["findMany", "findFirst", "count", "create", "delete"].map((m) => [
        m,
        vi.fn().mockImplementation(() => {
          throw new Error(`scheduling must not touch outsideActivity.${m}`);
        }),
      ]),
    ) as Record<"findMany" | "findFirst" | "count" | "create" | "delete", ReturnType<typeof vi.fn>>,
    $queryRaw: vi.fn().mockResolvedValue(opts.noLock ? [] : [{ id: "meso-1" }]),
    $transaction: vi.fn(),
  };
  db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) => fn(db));
  const caller = createCaller({ db, session: { user: { id: "user-1" } } } as unknown as Parameters<typeof createCaller>[0]);
  return { caller, db };
}

const expectedOf = (rows: { sessionId: string; day: number | null }[]) =>
  rows.map((r) => ({ sessionId: r.sessionId, placement: r.day === null ? null : { day: r.day, daypart: null } }));
const SAVED = expectedOf([
  { sessionId: "s1", day: 3 },
  { sessionId: "s2", day: 5 },
]);

const D = (iso: string) => new Date(`${iso}T00:00:00Z`);
const bothHalves = (iso: string) => [
  { date: D(iso), daypart: "AM" as const },
  { date: D(iso), daypart: "PM" as const },
];

describe("getWeekSchedule", () => {
  it("returns the saved layout, dates and engine input, scoped to the signed-in athlete", async () => {
    const { caller, db } = makeCaller();
    const view = await caller.getWeekSchedule({ weekIndex: 1 });
    expect(view.layout).toEqual({ s1: { day: 3, daypart: null }, s2: { day: 5, daypart: null } });
    expect(view.days[0]).toEqual({ date: "2026-10-05", weekday: 0 });
    expect(view.input.firstOpenDay).toBe(2);
    expect(view.readOnly).toBe(false);
    expect(view.sessions.map((s) => s.label)).toEqual(["Upper A", "Upper B"]);
    const where = (db.mesocycle.findFirst.mock.calls[0]![0] as { where: unknown }).where;
    expect(where).toEqual({ status: "ACTIVE", athleteProfile: { userId: "user-1" } });
  });

  it("is NOT_FOUND without an active block", async () => {
    const { caller } = makeCaller({ noBlock: true });
    await expect(caller.getWeekSchedule({ weekIndex: 1 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("is NOT_FOUND for a week the block does not have", async () => {
    const { caller } = makeCaller();
    await expect(caller.getWeekSchedule({ weekIndex: 9 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("scheduling ignores outside activities", () => {
  it("getWeekSchedule and getReplacementOptions never touch outsideActivity", async () => {
    const { caller, db } = makeCaller({ exceptions: bothHalves("2026-10-08") });
    await expect(caller.getWeekSchedule({ weekIndex: 1 })).resolves.toBeDefined();
    await expect(caller.getReplacementOptions({ weekIndex: 1 })).resolves.toBeDefined();
    for (const fn of Object.values(db.outsideActivity)) expect(fn).not.toHaveBeenCalled();
  });
});

describe("read-only weeks follow the athlete's calendar", () => {
  // Perth is UTC+8. The block started Monday 5 Oct at 20:00 Perth, so week 1 is 5-11 Oct
  // local and week 2 is 12-18 Oct. Elapsed time from the start instant is not the question:
  // a week is finished exactly when every one of its local dates has passed.
  const PERTH_START = new Date("2026-10-05T12:00:00Z");
  const perth = () =>
    makeCaller({
      timezone: "Australia/Perth",
      startDate: PERTH_START,
      weeks: [
        weekRow(1, [sessionRow("s1", "wk-1", 0, "Upper A", 3), sessionRow("s2", "wk-1", 1, "Upper B", 5)]),
        weekRow(2, [sessionRow("t1", "wk-2", 0, "Upper A", 3), sessionRow("t2", "wk-2", 1, "Upper B", 5)]),
      ],
    });

  const at = async (iso: string, fn: () => Promise<void>) => {
    vi.setSystemTime(new Date(iso));
    try {
      await fn();
    } finally {
      vi.setSystemTime(NOW);
    }
  };

  it("keeps week 1 editable through its last local evening", async () => {
    await at("2026-10-11T15:30:00Z", async () => {
      // Sunday 23:30 in Perth.
      const { caller } = perth();
      expect((await caller.getWeekSchedule({ weekIndex: 1 })).readOnly).toBe(false);
      expect((await caller.getWeekSchedule({ weekIndex: 2 })).readOnly).toBe(false);
    });
  });

  it("makes week 1 read-only from the first local minute of the next Monday, and refuses writes to it", async () => {
    await at("2026-10-11T16:30:00Z", async () => {
      // Monday 00:30 in Perth; only 6 days 4.5 hours since the block started.
      const { caller, db } = perth();
      const one = await caller.getWeekSchedule({ weekIndex: 1 });
      expect(one.readOnly).toBe(true);
      expect(one.input.firstOpenDay).toBe(7);
      expect((await caller.getWeekSchedule({ weekIndex: 2 })).readOnly).toBe(false);
      expect(await caller.getSuggestions({ weekIndex: 1 })).toEqual([]);
      await expect(
        caller.applyLayout({
          weekIndex: 1,
          placements: [{ sessionId: "s2", day: 6, daypart: null }],
          expected: SAVED,
          origin: "athlete",
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "That week has already finished." });
      expect(db.trainingSession.updateMany).not.toHaveBeenCalled();
    });
  });
});

describe("applyLayout", () => {
  const move = (day: number) => ({
    weekIndex: 1,
    placements: [{ sessionId: "s2", day, daypart: null }],
    expected: SAVED,
    origin: "athlete" as const,
  });

  it("writes only the moved session and records a SCHEDULE decision", async () => {
    const { caller, db } = makeCaller();
    const res = await caller.applyLayout(move(6));
    expect(res).toEqual({ weekIndex: 1, applied: [], skipped: [] });
    expect(db.trainingSession.updateMany).toHaveBeenCalledTimes(1);
    expect(db.trainingSession.updateMany).toHaveBeenCalledWith({
      where: { id: "s2", status: "SCHEDULED" },
      data: { dayOfWeek: 6, daypart: null },
    });
    expect(db.trainingSession.update).not.toHaveBeenCalled();
    const log = (db.decisionLog.create.mock.calls[0]![0] as { data: { type: string; status: string; weekIndex: number; payload: { origin: string; before: unknown; after: unknown } } }).data;
    expect(log.type).toBe("SCHEDULE");
    expect(log.status).toBe("APPLIED");
    expect(log.weekIndex).toBe(1);
    expect(log.payload.origin).toBe("athlete");
    expect(log.payload.before).toEqual({ s1: { day: 3, daypart: null }, s2: { day: 5, daypart: null } });
    expect(log.payload.after).toEqual({ s1: { day: 3, daypart: null }, s2: { day: 6, daypart: null } });
  });

  it("writes nothing when nothing moved", async () => {
    const { caller, db } = makeCaller();
    await caller.applyLayout(move(5));
    expect(db.trainingSession.updateMany).not.toHaveBeenCalled();
    expect(db.decisionLog.create).not.toHaveBeenCalled();
  });

  it("is CONFLICT when the client's starting point is stale (second tab, double submit)", async () => {
    const { caller, db } = makeCaller();
    const stale = { ...move(6), expected: expectedOf([{ sessionId: "s1", day: 3 }, { sessionId: "s2", day: 4 }]) };
    await expect(caller.applyLayout(stale)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(db.trainingSession.updateMany).not.toHaveBeenCalled();
  });

  it("is CONFLICT when expected does not cover every session in the week", async () => {
    const { caller } = makeCaller();
    const partial = { ...move(6), expected: expectedOf([{ sessionId: "s2", day: 5 }]) };
    await expect(caller.applyLayout(partial)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("is CONFLICT, and logs nothing, when the guarded write reports fewer rows than sessions moved", async () => {
    const { caller, db } = makeCaller({ writeCount: 0 });
    await expect(caller.applyLayout(move(6))).rejects.toMatchObject({ code: "CONFLICT" });
    expect(db.decisionLog.create).not.toHaveBeenCalled();
  });

  it("is CONFLICT (not BAD_REQUEST) when a moved session was completed since the client loaded the week", async () => {
    const { caller, db } = makeCaller({
      week1: [sessionRow("s1", "wk-1", 0, "Upper A", 3), sessionRow("s2", "wk-1", 1, "Upper B", 5, "COMPLETED")],
    });
    await expect(caller.applyLayout(move(6))).rejects.toMatchObject({ code: "CONFLICT" });
    expect(db.trainingSession.updateMany).not.toHaveBeenCalled();
    expect(db.decisionLog.create).not.toHaveBeenCalled();
  });

  it("takes the block row lock before any validation read or write", async () => {
    const { caller, db } = makeCaller();
    await caller.applyLayout(move(6));
    const lock = db.$queryRaw.mock.invocationCallOrder[0]!;
    expect(lock).toBeLessThan(db.mesocycle.findFirst.mock.invocationCallOrder[0]!);
    expect(lock).toBeLessThan(db.trainingSession.updateMany.mock.invocationCallOrder[0]!);
    expect(lock).toBeLessThan(db.decisionLog.create.mock.invocationCallOrder[0]!);
  });

  it("is NOT_FOUND when the lock finds no active block", async () => {
    const { caller, db } = makeCaller({ noLock: true });
    await expect(caller.applyLayout(move(6))).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.mesocycle.findFirst).not.toHaveBeenCalled();
    expect(db.trainingSession.updateMany).not.toHaveBeenCalled();
  });

  it("reports every violated rule, labelled by session", async () => {
    // s1 onto Monday (already past) and s2 onto the blocked Saturday, in one request.
    const { caller } = makeCaller({
      availability: [
        { dayOfWeek: 6, daypart: "AM", state: "BLOCKED" },
        { dayOfWeek: 6, daypart: "PM", state: "BLOCKED" },
      ],
    });
    const both = {
      ...move(6),
      placements: [
        { sessionId: "s1", day: 0, daypart: null },
        { sessionId: "s2", day: 6, daypart: null },
      ],
    };
    const err = await caller.applyLayout(both).catch((e: unknown) => e as { code: string; message: string });
    expect(err).toMatchObject({ code: "BAD_REQUEST" });
    const message = (err as { message: string }).message;
    expect(message).toContain("Upper A: That day has already passed.");
    expect(message).toContain("Upper B: That time is blocked in your availability.");
  });

  it("refuses a day that has already passed", async () => {
    const { caller } = makeCaller();
    await expect(caller.applyLayout(move(0))).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("refuses a blocked day", async () => {
    const { caller } = makeCaller({
      availability: [
        { dayOfWeek: 6, daypart: "AM", state: "BLOCKED" },
        { dayOfWeek: 6, daypart: "PM", state: "BLOCKED" },
      ],
    });
    await expect(caller.applyLayout(move(6))).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("refuses two sessions on one day", async () => {
    const { caller } = makeCaller();
    await expect(caller.applyLayout(move(3))).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("refuses a session id from outside the week", async () => {
    const { caller } = makeCaller();
    const foreign = { ...move(6), placements: [{ sessionId: "elsewhere", day: 6, daypart: null }] };
    await expect(caller.applyLayout(foreign)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("carries the layout forward to untouched weeks and reports the ones it skipped", async () => {
    const laterWeeks = [
      weekRow(2, [sessionRow("a1", "wk-2", 0, "Upper A", 3), sessionRow("a2", "wk-2", 1, "Upper B", 5)]),
      weekRow(3, [sessionRow("b1", "wk-3", 0, "Upper A", 3, "COMPLETED"), sessionRow("b2", "wk-3", 1, "Upper B", 5)]),
      weekRow(4, [sessionRow("c1", "wk-4", 0, "Upper A", 3)]),
    ];
    const { caller, db } = makeCaller({ laterWeeks });
    const res = await caller.applyLayout({ ...move(6), carryForward: true });
    expect(res.applied).toEqual([2]);
    expect(res.skipped).toEqual([
      { weekIndex: 3, reason: "already_started" },
      { weekIndex: 4, reason: "different_sessions" },
    ]);
    expect(db.trainingSession.updateMany).toHaveBeenCalledWith({
      where: { id: "a2", status: "SCHEDULED" },
      data: { dayOfWeek: 6, daypart: null },
    });
    const written = db.trainingSession.updateMany.mock.calls.map((c) => (c[0] as { where: { id: string } }).where.id);
    expect(written).not.toContain("b2");
  });

  it("does not carry a layout forward onto time blocked by an exception in the later week", async () => {
    // Sun 18 Oct is week 2's Sunday; week 1's Sunday (11 Oct) is free.
    const laterWeeks = [weekRow(2, [sessionRow("a1", "wk-2", 0, "Upper A", 3), sessionRow("a2", "wk-2", 1, "Upper B", 5)])];
    const { caller, db } = makeCaller({ laterWeeks, exceptions: bothHalves("2026-10-18") });
    const res = await caller.applyLayout({ ...move(6), carryForward: true });
    expect(res.applied).toEqual([]);
    expect(res.skipped).toEqual([{ weekIndex: 2, reason: "not_allowed" }]);
    const written = db.trainingSession.updateMany.mock.calls.map((c) => (c[0] as { where: { id: string } }).where.id);
    expect(written).toEqual(["s2"]);
    expect(db.decisionLog.create).toHaveBeenCalledTimes(1);
  });
});

describe("getSuggestions / dismissSuggestion", () => {
  // Two chest sessions on consecutive days: the engine should want them apart.
  const tight = [sessionRow("s1", "wk-1", 0, "Upper A", 3), sessionRow("s2", "wk-1", 1, "Upper B", 4)];

  it("suggests a move for a layout with a recovery problem", async () => {
    const { caller } = makeCaller({ week1: tight });
    const out = await caller.getSuggestions({ weekIndex: 1 });
    expect(out.length).toBeGreaterThan(0);
    expect(out[0]!.headline).toMatch(/^(Move|Swap) /);
    expect(out[0]!.reasons.length).toBeGreaterThan(0);
  });

  it("returns nothing once that exact layout was dismissed", async () => {
    const { caller } = makeCaller({ week1: tight, dismissed: [{ payload: { layoutKey: "s1:3:-|s2:4:-" } }] });
    expect(await caller.getSuggestions({ weekIndex: 1 })).toEqual([]);
  });

  it("suggests again when the dismissed layout was a different one", async () => {
    const { caller } = makeCaller({ week1: tight, dismissed: [{ payload: { layoutKey: "s1:3:-|s2:6:-" } }] });
    expect((await caller.getSuggestions({ weekIndex: 1 })).length).toBeGreaterThan(0);
  });

  it("records a dismissal against the current layout", async () => {
    const { caller, db } = makeCaller({ week1: tight });
    await caller.dismissSuggestion({ weekIndex: 1 });
    const log = (db.decisionLog.create.mock.calls[0]![0] as { data: { type: string; status: string; payload: unknown } }).data;
    expect(log.type).toBe("SCHEDULE");
    expect(log.status).toBe("REJECTED");
    expect(log.payload).toEqual({ layoutKey: "s1:3:-|s2:4:-" });
  });
});

describe("setException", () => {
  it("writes both halves for a whole day under the block lock and moves nothing this week", async () => {
    const { caller, db } = makeCaller();
    const res = await caller.setException({ date: "2026-10-08", daypart: null }); // Thu, week 1 (current)
    expect(db.$queryRaw).toHaveBeenCalled();
    expect(db.availabilityException.createMany).toHaveBeenCalledWith({
      data: [
        { athleteProfileId: "profile-1", date: D("2026-10-08"), daypart: "AM" },
        { athleteProfileId: "profile-1", date: D("2026-10-08"), daypart: "PM" },
      ],
      skipDuplicates: true,
    });
    expect(res).toEqual({ weekIndex: 1, moved: [], needsChoice: false });
    expect(db.trainingSession.updateMany).not.toHaveBeenCalled();
  });

  it("refuses a day that has passed, a date outside the block, and a half-day in one-a-day mode", async () => {
    const { caller, db } = makeCaller();
    await expect(caller.setException({ date: "2026-10-06", daypart: null })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.setException({ date: "2026-11-02", daypart: null })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.setException({ date: "2026-10-04", daypart: null })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.setException({ date: "2026-10-08", daypart: "AM" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.availabilityException.createMany).not.toHaveBeenCalled();
  });

  it("allows today", async () => {
    const { caller } = makeCaller();
    await expect(caller.setException({ date: "2026-10-07", daypart: null })).resolves.toMatchObject({ weekIndex: 1 });
  });

  it("uses the athlete's local date: early morning in Perth is not yesterday", async () => {
    // 23:30Z on Tue 6 Oct is 07:30 on Wed 7 Oct in Perth.
    vi.setSystemTime(new Date("2026-10-06T23:30:00Z"));
    try {
      const { caller } = makeCaller({ timezone: "Australia/Perth", startDate: new Date("2026-10-04T16:00:00Z") });
      await expect(caller.setException({ date: "2026-10-07", daypart: null })).resolves.toMatchObject({ weekIndex: 1 });
      await expect(caller.setException({ date: "2026-10-06", daypart: null })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    } finally {
      vi.setSystemTime(NOW);
    }
  });

  it("returns NOT_FOUND without an active block", async () => {
    const { caller } = makeCaller({ noLock: true });
    await expect(caller.setException({ date: "2026-10-08", daypart: null })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("quietly re-places a future week and logs it", async () => {
    // Week 2 is Mon 12…Sun 18 Oct. s3 sits on Thu 15, which is being blocked.
    const week2 = weekRow(2, [sessionRow("s3", "wk-2", 0, "Upper A", 3), sessionRow("s4", "wk-2", 1, "Upper B", 5)]);
    const { caller, db } = makeCaller({ weeks: [weekRow(1, []), week2], exceptions: bothHalves("2026-10-15") });
    const res = await caller.setException({ date: "2026-10-15", daypart: null });
    expect(res.weekIndex).toBe(2);
    expect(res.needsChoice).toBe(false);
    expect(res.moved).toHaveLength(1);
    expect(res.moved[0]).toMatch(/^Upper A: Thu → /);
    expect(db.trainingSession.updateMany).toHaveBeenCalledTimes(1);
    expect((db.trainingSession.updateMany.mock.calls[0]![0] as { where: unknown }).where).toEqual({ id: "s3", status: "SCHEDULED" });
    expect((db.decisionLog.create.mock.calls[0]![0] as { data: unknown }).data).toMatchObject({ weekIndex: 2, type: "SCHEDULE", status: "APPLIED", reasoning: "exception" });
  });

  it("moves nothing in a future week that is too crowded, and says a choice is needed", async () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g"];
    const week2 = weekRow(2, ids.map((id, i) => sessionRow(id, "wk-2", i, `S${i}`, i)));
    const { caller, db } = makeCaller({ weeks: [weekRow(1, []), week2], exceptions: bothHalves("2026-10-15") });
    const res = await caller.setException({ date: "2026-10-15", daypart: null });
    expect(res).toEqual({ weekIndex: 2, moved: [], needsChoice: true });
    expect(db.trainingSession.updateMany).not.toHaveBeenCalled();
  });

  // Week 2 is Mon 12…Sun 18 Oct, with a session on Thu 15 and one on Sat 17.
  const futureWeek = () => weekRow(2, [sessionRow("s3", "wk-2", 0, "Upper A", 3), sessionRow("s4", "wk-2", 1, "Upper B", 5)]);

  it("takes the block lock before any read or write", async () => {
    const { caller, db } = makeCaller({ weeks: [weekRow(1, []), futureWeek()], exceptions: bothHalves("2026-10-15") });
    await caller.setException({ date: "2026-10-15", daypart: null });
    const lock = db.$queryRaw.mock.invocationCallOrder[0]!;
    expect(lock).toBeLessThan(db.mesocycle.findFirst.mock.invocationCallOrder[0]!);
    expect(lock).toBeLessThan(db.availabilityException.createMany.mock.invocationCallOrder[0]!);
    expect(lock).toBeLessThan(db.trainingSession.updateMany.mock.invocationCallOrder[0]!);
    expect(lock).toBeLessThan(db.decisionLog.create.mock.invocationCallOrder[0]!);
  });

  it("writes one row for a half-day and two for a whole day in AM/PM mode", async () => {
    const half = makeCaller({ scheduleMode: "HALF_DAY" });
    await half.caller.setException({ date: "2026-10-08", daypart: "PM" });
    expect(half.db.availabilityException.createMany).toHaveBeenCalledWith({
      data: [{ athleteProfileId: "profile-1", date: D("2026-10-08"), daypart: "PM" }],
      skipDuplicates: true,
    });
    const whole = makeCaller({ scheduleMode: "HALF_DAY" });
    await whole.caller.setException({ date: "2026-10-08", daypart: null });
    expect(whole.db.availabilityException.createMany).toHaveBeenCalledWith({
      data: [
        { athleteProfileId: "profile-1", date: D("2026-10-08"), daypart: "AM" },
        { athleteProfileId: "profile-1", date: D("2026-10-08"), daypart: "PM" },
      ],
      skipDuplicates: true,
    });
  });

  it("refuses a date before a block that has not started yet", async () => {
    // The block starts Mon 12 Oct; Fri 9 Oct is still to come but is not in it.
    const { caller, db } = makeCaller({ startDate: new Date("2026-10-12T00:00:00Z") });
    await expect(caller.setException({ date: "2026-10-09", daypart: null })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("outside your current block") as unknown,
    });
    expect(db.availabilityException.createMany).not.toHaveBeenCalled();
  });

  it("is CONFLICT, and logs nothing, when the quiet re-placement writes fewer rows than it moved", async () => {
    const { caller, db } = makeCaller({ weeks: [weekRow(1, []), futureWeek()], exceptions: bothHalves("2026-10-15"), writeCount: 0 });
    await expect(caller.setException({ date: "2026-10-15", daypart: null })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(db.trainingSession.updateMany).toHaveBeenCalled();
    expect(db.decisionLog.create).not.toHaveBeenCalled();
  });

  it("leaves a future week alone when no session stands on the blocked time", async () => {
    // Fri 16 Oct holds no session.
    const { caller, db } = makeCaller({ weeks: [weekRow(1, []), futureWeek()], exceptions: bothHalves("2026-10-16") });
    const res = await caller.setException({ date: "2026-10-16", daypart: null });
    expect(res).toEqual({ weekIndex: 2, moved: [], needsChoice: false });
    expect(db.trainingSession.updateMany).not.toHaveBeenCalled();
    expect(db.decisionLog.create).not.toHaveBeenCalled();
  });

  it("writes nothing and asks for a choice when the re-placed week would break a hard rule", async () => {
    // The engine's own layouts always pass, so the check is made to report a violation.
    vi.mocked(checkLayout).mockReturnValueOnce([{ kind: "day_limit", sessionId: "s3" }]);
    const { caller, db } = makeCaller({ weeks: [weekRow(1, []), futureWeek()], exceptions: bothHalves("2026-10-15") });
    const res = await caller.setException({ date: "2026-10-15", daypart: null });
    expect(res).toEqual({ weekIndex: 2, moved: [], needsChoice: true });
    expect(db.trainingSession.updateMany).not.toHaveBeenCalled();
    expect(db.decisionLog.create).not.toHaveBeenCalled();
  });
});

describe("clearException", () => {
  it("deletes both halves for a whole day and never moves a session", async () => {
    const { caller, db } = makeCaller();
    await expect(caller.clearException({ date: "2026-10-08", daypart: null })).resolves.toEqual({ ok: true });
    expect(db.availabilityException.deleteMany).toHaveBeenCalledWith({
      where: { athleteProfileId: "profile-1", date: D("2026-10-08"), daypart: { in: ["AM", "PM"] } },
    });
    expect(db.trainingSession.updateMany).not.toHaveBeenCalled();
  });

  it("succeeds when there was nothing to clear", async () => {
    const { caller, db } = makeCaller();
    db.availabilityException.deleteMany.mockResolvedValue({ count: 0 });
    await expect(caller.clearException({ date: "2026-10-08", daypart: null })).resolves.toEqual({ ok: true });
    expect(db.availabilityException.deleteMany).toHaveBeenCalledTimes(1);
    expect(db.availabilityException.deleteMany).toHaveBeenCalledWith({
      where: { athleteProfileId: "profile-1", date: D("2026-10-08"), daypart: { in: ["AM", "PM"] } },
    });
  });

  it("takes the block lock before any read or write", async () => {
    const { caller, db } = makeCaller();
    await caller.clearException({ date: "2026-10-08", daypart: null });
    const lock = db.$queryRaw.mock.invocationCallOrder[0]!;
    expect(lock).toBeLessThan(db.mesocycle.findFirst.mock.invocationCallOrder[0]!);
    expect(lock).toBeLessThan(db.availabilityException.deleteMany.mock.invocationCallOrder[0]!);
  });

  it("deletes only the named half in AM/PM mode, and both for a whole day", async () => {
    const half = makeCaller({ scheduleMode: "HALF_DAY" });
    await half.caller.clearException({ date: "2026-10-08", daypart: "AM" });
    expect(half.db.availabilityException.deleteMany).toHaveBeenCalledWith({
      where: { athleteProfileId: "profile-1", date: D("2026-10-08"), daypart: { in: ["AM"] } },
    });
    const whole = makeCaller({ scheduleMode: "HALF_DAY" });
    await whole.caller.clearException({ date: "2026-10-08", daypart: null });
    expect(whole.db.availabilityException.deleteMany).toHaveBeenCalledWith({
      where: { athleteProfileId: "profile-1", date: D("2026-10-08"), daypart: { in: ["AM", "PM"] } },
    });
  });
});

describe("getWeekSchedule with exceptions", () => {
  it("shows the exception as a one-off blocked cell and warns about the stranded session", async () => {
    const { caller } = makeCaller({ exceptions: bothHalves("2026-10-08") }); // s1 is on Thu
    const view = await caller.getWeekSchedule({ weekIndex: 1 });
    expect(view.input.availability).toContainEqual({ day: 3, daypart: "AM", state: "BLOCKED", oneOff: true });
    expect(view.warnings.some((w) => w.includes("blocked"))).toBe(true);
  });
});

describe("getReplacementOptions", () => {
  it("returns nothing when no session is stranded", async () => {
    const { caller } = makeCaller();
    await expect(caller.getReplacementOptions({ weekIndex: 1 })).resolves.toEqual([]);
  });

  it("returns engine-ordered options with the first as lead when Jev says nothing", async () => {
    vi.mocked(executeJudgement).mockResolvedValue([]);
    const { caller } = makeCaller({ exceptions: bothHalves("2026-10-08") });
    const options = await caller.getReplacementOptions({ weekIndex: 1 });
    expect(options.length).toBeGreaterThanOrEqual(1);
    expect(options[0]!.lead).toBe(true);
    expect(options.every((o) => !o.judged)).toBe(true);
    expect(options[0]!.moves.some((m) => m.startsWith("Upper A: Thu → "))).toBe(true);
  });

  it("leads with Jev's confident pick", async () => {
    const { caller } = makeCaller({
      exceptions: bothHalves("2026-10-08"),
      availability: [{ dayOfWeek: 6, daypart: "AM", state: "PREFERRED" }],
    });
    vi.mocked(executeJudgement).mockResolvedValue([]);
    const plain = await caller.getReplacementOptions({ weekIndex: 1 });
    expect(plain.length).toBeGreaterThanOrEqual(2); // something to reorder
    const last = plain[plain.length - 1]!.id;
    vi.mocked(executeJudgement).mockResolvedValue([
      { id: "replacement_pick", kind: "choice", choice: last, confidence: 0.99, probabilities: { [last]: 0.99 } },
    ]);
    const judged = await caller.getReplacementOptions({ weekIndex: 1 });
    expect(judged[0]!.id).toBe(last);
    expect(judged[0]!.judged).toBe(true);
    vi.mocked(executeJudgement).mockResolvedValue([]);
  });

  it("falls back to engine order when the judgement throws", async () => {
    const { caller } = makeCaller({
      exceptions: bothHalves("2026-10-08"),
      availability: [{ dayOfWeek: 6, daypart: "AM", state: "PREFERRED" }],
    });
    const plain = await caller.getReplacementOptions({ weekIndex: 1 });
    expect(plain.length).toBeGreaterThanOrEqual(2);
    vi.mocked(executeJudgement).mockClear();
    vi.mocked(executeJudgement).mockRejectedValueOnce(new Error("boom"));
    const options = await caller.getReplacementOptions({ weekIndex: 1 });
    expect(executeJudgement).toHaveBeenCalledTimes(1);
    expect(options.map((o) => o.id)).toEqual(plain.map((o) => o.id));
    expect(options.every((o) => !o.judged)).toBe(true);
  });

  it("offers nothing for a completed session on a blocked day", async () => {
    const { caller } = makeCaller({
      week1: [sessionRow("s1", "wk-1", 0, "Upper A", 3, "COMPLETED"), sessionRow("s2", "wk-1", 1, "Upper B", 5)],
      exceptions: bothHalves("2026-10-08"),
    });
    await expect(caller.getReplacementOptions({ weekIndex: 1 })).resolves.toEqual([]);
  });
});

describe("getSuggestions while stranded", () => {
  it("stays quiet so the replacement panel is the only voice", async () => {
    const { caller } = makeCaller({ exceptions: bothHalves("2026-10-08") });
    await expect(caller.getSuggestions({ weekIndex: 1 })).resolves.toEqual([]);
  });
});

describe("applyLayout with a replacement", () => {
  it("applies an accepted option and logs its origin", async () => {
    const { caller, db } = makeCaller({ exceptions: bothHalves("2026-10-08") });
    const [option] = await caller.getReplacementOptions({ weekIndex: 1 });
    await caller.applyLayout({ weekIndex: 1, placements: option!.placements, expected: SAVED, origin: "replacement" });
    const log = (db.decisionLog.create.mock.calls.at(-1)![0] as { data: unknown }).data;
    expect(log).toMatchObject({ type: "SCHEDULE", status: "APPLIED", reasoning: "replacement", summary: "Week re-arranged around blocked time" });
  });

  it("logs which option was accepted, and no option id when none was sent", async () => {
    const payloadOf = (db: ReturnType<typeof makeCaller>["db"]) =>
      (db.decisionLog.create.mock.calls.at(-1)![0] as { data: { payload: Record<string, unknown> } }).data.payload;
    const accepted = makeCaller({ exceptions: bothHalves("2026-10-08") });
    const [option] = await accepted.caller.getReplacementOptions({ weekIndex: 1 });
    await accepted.caller.applyLayout({
      weekIndex: 1,
      placements: option!.placements,
      expected: SAVED,
      origin: "replacement",
      optionId: option!.id,
    });
    expect(payloadOf(accepted.db)).toMatchObject({ origin: "replacement", optionId: option!.id });

    const dragged = makeCaller();
    await dragged.caller.applyLayout({ weekIndex: 1, placements: [{ sessionId: "s2", day: 6, daypart: null }], expected: SAVED, origin: "athlete" });
    expect(payloadOf(dragged.db)).not.toHaveProperty("optionId");
  });
});

describe("setExceptions", () => {
  it("writes every cell in one transaction under the lock", async () => {
    const { caller, db } = makeCaller();
    const res = await caller.setExceptions({
      cells: [
        { date: "2026-10-08", daypart: null },
        { date: "2026-10-09", daypart: null },
      ],
    });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.$queryRaw.mock.invocationCallOrder[0]!).toBeLessThan(db.availabilityException.createMany.mock.invocationCallOrder[0]!);
    const rows = db.availabilityException.createMany.mock.calls.flatMap((c) => (c[0] as { data: unknown[] }).data);
    expect(rows).toHaveLength(4);
    expect(res).toEqual({ weeks: [{ weekIndex: 1, moved: [], needsChoice: false }] });
  });

  it("writes nothing when any cell is refused", async () => {
    const { caller, db } = makeCaller();
    await expect(
      caller.setExceptions({ cells: [{ date: "2026-10-08", daypart: null }, { date: "2026-10-06", daypart: null }] }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.availabilityException.createMany).not.toHaveBeenCalled();
  });

  it("re-arranges each later week once, however many of its days are blocked", async () => {
    const week2 = weekRow(2, [sessionRow("s3", "wk-2", 0, "Upper A", 3), sessionRow("s4", "wk-2", 1, "Upper B", 4)]);
    const { caller, db } = makeCaller({
      weeks: [weekRow(1, []), week2],
      exceptions: [...bothHalves("2026-10-15"), ...bothHalves("2026-10-16")],
    });
    const res = await caller.setExceptions({
      cells: [
        { date: "2026-10-15", daypart: null },
        { date: "2026-10-16", daypart: null },
      ],
    });
    expect(res.weeks).toHaveLength(1);
    expect(res.weeks[0]).toMatchObject({ weekIndex: 2, needsChoice: false });
    expect(res.weeks[0]!.moved).toHaveLength(2);
    const logs = db.decisionLog.create.mock.calls.filter((c) => (c[0] as { data: { weekIndex: number } }).data.weekIndex === 2);
    expect(logs).toHaveLength(1);
  });

  it("reports the current week and a later week separately, in order", async () => {
    const week2 = weekRow(2, [sessionRow("s3", "wk-2", 0, "Upper A", 3)]);
    const { caller } = makeCaller({ weeks: [weekRow(1, []), week2], exceptions: bothHalves("2026-10-15") });
    const res = await caller.setExceptions({
      cells: [
        { date: "2026-10-15", daypart: null },
        { date: "2026-10-08", daypart: null },
      ],
    });
    expect(res.weeks.map((w) => w.weekIndex)).toEqual([1, 2]);
  });

  it("refuses a half-day in one-a-day mode and more than fourteen cells", async () => {
    const { caller } = makeCaller();
    await expect(caller.setExceptions({ cells: [{ date: "2026-10-08", daypart: "AM" }] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const many = Array.from({ length: 15 }, () => ({ date: "2026-10-08", daypart: null }));
    await expect(caller.setExceptions({ cells: many })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("writes the two halves once when one-a-day mode names the same whole day twice", async () => {
    const { caller, db } = makeCaller();
    await caller.setExceptions({
      cells: [
        { date: "2026-10-08", daypart: null },
        { date: "2026-10-08", daypart: null },
      ],
    });
    expect(db.availabilityException.createMany).toHaveBeenCalledTimes(1);
    expect(db.availabilityException.createMany).toHaveBeenCalledWith({
      data: [
        { athleteProfileId: "profile-1", date: D("2026-10-08"), daypart: "AM" },
        { athleteProfileId: "profile-1", date: D("2026-10-08"), daypart: "PM" },
      ],
      skipDuplicates: true,
    });
  });

  it("is CONFLICT when the re-arrangement of any later week is short, so the whole request fails", async () => {
    const week2 = weekRow(2, [sessionRow("s3", "wk-2", 0, "Upper A", 3)]);
    const week3 = weekRow(3, [sessionRow("s5", "wk-3", 0, "Upper A", 3)]);
    const { caller, db } = makeCaller({
      weeks: [weekRow(1, []), week2, week3],
      exceptions: [...bothHalves("2026-10-15"), ...bothHalves("2026-10-22")],
    });
    // The first later week writes its row; the second reports none.
    db.trainingSession.updateMany.mockReset();
    db.trainingSession.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValue({ count: 0 });
    await expect(
      caller.setExceptions({
        cells: [
          { date: "2026-10-15", daypart: null },
          { date: "2026-10-22", daypart: null },
        ],
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(db.trainingSession.updateMany).toHaveBeenCalledTimes(2);
    expect(db.decisionLog.create).toHaveBeenCalledTimes(1);
  });

  it("writes each row once when cells repeat or overlap", async () => {
    const { caller, db } = makeCaller({ scheduleMode: "HALF_DAY" });
    await caller.setExceptions({
      cells: [
        { date: "2026-10-08", daypart: null },
        { date: "2026-10-08", daypart: "AM" },
        { date: "2026-10-08", daypart: null },
        { date: "2026-10-09", daypart: "PM" },
      ],
    });
    expect(db.availabilityException.createMany).toHaveBeenCalledTimes(1);
    expect(db.availabilityException.createMany).toHaveBeenCalledWith({
      data: [
        { athleteProfileId: "profile-1", date: D("2026-10-08"), daypart: "AM" },
        { athleteProfileId: "profile-1", date: D("2026-10-08"), daypart: "PM" },
        { athleteProfileId: "profile-1", date: D("2026-10-09"), daypart: "PM" },
      ],
      skipDuplicates: true,
    });
  });
});

describe("clearExceptions", () => {
  it("deletes each cell's rows under the lock and moves nothing", async () => {
    const { caller, db } = makeCaller();
    await expect(
      caller.clearExceptions({ cells: [{ date: "2026-10-08", daypart: null }, { date: "2026-10-09", daypart: null }] }),
    ).resolves.toEqual({ ok: true });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.availabilityException.deleteMany).toHaveBeenCalledTimes(2);
    expect(db.trainingSession.updateMany).not.toHaveBeenCalled();
  });

  it("takes the block lock before any read or delete", async () => {
    const { caller, db } = makeCaller();
    await caller.clearExceptions({ cells: [{ date: "2026-10-08", daypart: null }] });
    const lock = db.$queryRaw.mock.invocationCallOrder[0]!;
    expect(lock).toBeLessThan(db.mesocycle.findFirst.mock.invocationCallOrder[0]!);
    expect(lock).toBeLessThan(db.availabilityException.deleteMany.mock.invocationCallOrder[0]!);
  });

  it("clears both halves of each day in one-a-day mode, whatever half was named", async () => {
    const { caller, db } = makeCaller();
    await caller.clearExceptions({ cells: [{ date: "2026-10-08", daypart: "AM" }, { date: "2026-10-09", daypart: null }] });
    expect(db.availabilityException.deleteMany.mock.calls).toEqual([
      [{ where: { athleteProfileId: "profile-1", date: D("2026-10-08"), daypart: { in: ["AM", "PM"] } } }],
      [{ where: { athleteProfileId: "profile-1", date: D("2026-10-09"), daypart: { in: ["AM", "PM"] } } }],
    ]);
  });
});
