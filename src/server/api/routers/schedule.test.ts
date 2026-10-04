import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createCallerFactory } from "~/server/api/trpc";
import { scheduleRouter } from "./schedule";

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
  stillScheduled?: number;
}

function makeCaller(opts: Opts = {}) {
  const week1 = opts.week1 ?? [sessionRow("s1", "wk-1", 0, "Upper A", 3), sessionRow("s2", "wk-1", 1, "Upper B", 5)];
  const meso = {
    id: "meso-1",
    startDate: START,
    lengthWeeks: 4,
    athleteProfile: { scheduleMode: "DAY", timezone: "UTC", availability: opts.availability ?? [] },
    weeks: [weekRow(1, week1)],
  };
  const db = {
    mesocycle: { findFirst: vi.fn().mockResolvedValue(opts.noBlock ? null : meso) },
    week: { findMany: vi.fn().mockResolvedValue(opts.laterWeeks ?? []) },
    trainingSession: {
      update: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockImplementation((args: { where: { id: { in: string[] } } }) =>
        Promise.resolve(opts.stillScheduled ?? args.where.id.in.length),
      ),
    },
    decisionLog: {
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue(opts.dismissed ?? []),
    },
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
    expect(db.trainingSession.update).toHaveBeenCalledTimes(1);
    expect(db.trainingSession.update).toHaveBeenCalledWith({ where: { id: "s2" }, data: { dayOfWeek: 6, daypart: null } });
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
    expect(db.trainingSession.update).not.toHaveBeenCalled();
    expect(db.decisionLog.create).not.toHaveBeenCalled();
  });

  it("is CONFLICT when the client's starting point is stale (second tab, double submit)", async () => {
    const { caller, db } = makeCaller();
    const stale = { ...move(6), expected: expectedOf([{ sessionId: "s1", day: 3 }, { sessionId: "s2", day: 4 }]) };
    await expect(caller.applyLayout(stale)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(db.trainingSession.update).not.toHaveBeenCalled();
  });

  it("is CONFLICT when expected does not cover every session in the week", async () => {
    const { caller } = makeCaller();
    const partial = { ...move(6), expected: expectedOf([{ sessionId: "s2", day: 5 }]) };
    await expect(caller.applyLayout(partial)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("is CONFLICT when a moved session stopped being SCHEDULED mid-flight", async () => {
    const { caller, db } = makeCaller({ stillScheduled: 0 });
    await expect(caller.applyLayout(move(6))).rejects.toMatchObject({ code: "CONFLICT" });
    expect(db.trainingSession.update).not.toHaveBeenCalled();
  });

  it("refuses to move a completed session", async () => {
    const { caller } = makeCaller({
      week1: [sessionRow("s1", "wk-1", 0, "Upper A", 3), sessionRow("s2", "wk-1", 1, "Upper B", 5, "COMPLETED")],
    });
    await expect(caller.applyLayout(move(6))).rejects.toMatchObject({ code: "BAD_REQUEST" });
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
    expect(db.trainingSession.update).toHaveBeenCalledWith({ where: { id: "a2" }, data: { dayOfWeek: 6, daypart: null } });
    expect(db.trainingSession.update).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: "b2" } }));
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
