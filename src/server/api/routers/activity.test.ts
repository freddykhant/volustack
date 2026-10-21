import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createCallerFactory } from "~/server/api/trpc";
import { activityRouter } from "./activity";

const createCaller = createCallerFactory(activityRouter);

// Wednesday 7 Oct 2026 (UTC). The block started Monday 5 Oct, so week 1 runs Mon 5 … Sun 11 Oct.
const NOW = new Date("2026-10-07T02:00:00Z");
const START = new Date("2026-10-05T00:00:00Z");
const D = (iso: string) => new Date(`${iso}T00:00:00Z`);

// Fake only Date: tRPC's dev timing middleware awaits a real setTimeout.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterAll(() => {
  vi.useRealTimers();
});

function sessionRow(id: string, weekId: string, order: number, dayOfWeek: number) {
  return {
    id,
    weekId,
    order,
    splitSlot: "Upper A",
    dayOfWeek,
    daypart: null,
    targetDurationMin: 60,
    status: "SCHEDULED" as const,
    completedAt: null,
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

function weekRow(index: number) {
  return { id: `wk-${index}`, mesocycleId: "meso-1", index, isDeload: false, sessions: [sessionRow(`s${index}`, `wk-${index}`, 0, 2)] };
}

type ActivityRow = {
  id: string;
  date: Date;
  daypart: "AM" | "PM" | null;
  kind: "RUN" | "RIDE" | "SWIM" | "SPORT" | "OTHER";
  intensity: "EASY" | "MODERATE" | "HARD";
  durationMin: number | null;
  createdAt: Date;
};

const activityRow = (id: string, iso: string): ActivityRow => ({
  id,
  date: D(iso),
  daypart: "AM",
  kind: "RUN",
  intensity: "HARD",
  durationMin: 45,
  createdAt: START,
});

interface Opts {
  rows?: ActivityRow[];
  count?: number;
  /** What `outsideActivity.findFirst` returns for `remove`; default none. */
  found?: { id: string; date: Date } | null;
}

function makeCaller(opts: Opts = {}) {
  const meso = {
    id: "meso-1",
    startDate: START,
    lengthWeeks: 4,
    athleteProfile: { id: "profile-1", scheduleMode: "DAY", timezone: "UTC", availability: [], availabilityExceptions: [] },
    weeks: [weekRow(1), weekRow(2)],
  };
  const db = {
    mesocycle: { findFirst: vi.fn().mockResolvedValue(meso) },
    outsideActivity: {
      findMany: vi.fn().mockResolvedValue(opts.rows ?? []),
      findFirst: vi.fn().mockResolvedValue(opts.found ?? null),
      count: vi.fn().mockResolvedValue(opts.count ?? 0),
      create: vi.fn().mockImplementation(({ data }: { data: object }) => ({ id: "new", createdAt: NOW, ...data })),
      delete: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn(),
  };
  db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) => fn(db));
  const caller = createCaller({ db, session: { user: { id: "user-1" } } } as unknown as Parameters<typeof createCaller>[0]);
  return { caller, db };
}

const base = { weekIndex: 1, date: "2026-10-08", daypart: "AM" as const, kind: "RUN" as const, intensity: "HARD" as const, durationMin: 45 };

describe("list", () => {
  it("returns the week's activities as views", async () => {
    const { caller, db } = makeCaller({ rows: [activityRow("a1", "2026-10-06"), activityRow("a2", "2026-10-08")] });
    const views = await caller.list({ weekIndex: 1 });
    expect(views).toEqual([
      { id: "a1", date: "2026-10-06", daypart: "AM", kind: "RUN", intensity: "HARD", durationMin: 45 },
      { id: "a2", date: "2026-10-08", daypart: "AM", kind: "RUN", intensity: "HARD", durationMin: 45 },
    ]);
    const where = (db.outsideActivity.findMany.mock.calls[0]![0] as { where: unknown }).where;
    expect(where).toEqual({ athleteProfileId: "profile-1", date: { gte: D("2026-10-05"), lte: D("2026-10-11") } });
  });
});

describe("add", () => {
  it("writes a row for a date in the viewed week", async () => {
    const { caller, db } = makeCaller();
    const view = await caller.add(base);
    expect(db.outsideActivity.create).toHaveBeenCalledWith({
      data: {
        athleteProfileId: "profile-1",
        date: D("2026-10-08"),
        daypart: "AM",
        kind: "RUN",
        intensity: "HARD",
        durationMin: 45,
      },
    });
    expect(view).toEqual({ id: "new", date: "2026-10-08", daypart: "AM", kind: "RUN", intensity: "HARD", durationMin: 45 });
  });

  it("refuses a date outside the viewed week with BAD_REQUEST", async () => {
    const { caller, db } = makeCaller();
    await expect(caller.add({ ...base, date: "2026-10-12" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.outsideActivity.create).not.toHaveBeenCalled();
  });

  it("refuses a finished week with BAD_REQUEST", async () => {
    vi.setSystemTime(new Date("2026-10-14T02:00:00Z")); // week 2
    try {
      const { caller, db } = makeCaller();
      await expect(caller.add({ ...base, weekIndex: 1, date: "2026-10-08" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(db.outsideActivity.create).not.toHaveBeenCalled();
    } finally {
      vi.setSystemTime(NOW);
    }
  });

  it("refuses a fourth activity on the same date with BAD_REQUEST and does not create", async () => {
    const { caller, db } = makeCaller({ count: 3 });
    await expect(caller.add(base)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.outsideActivity.count).toHaveBeenCalledWith({ where: { athleteProfileId: "profile-1", date: D("2026-10-08") } });
    expect(db.outsideActivity.create).not.toHaveBeenCalled();
  });

  it("allows a past day of the current week", async () => {
    const { caller, db } = makeCaller();
    // NOW is Wednesday; Monday of the same week is already past.
    await expect(caller.add({ ...base, date: "2026-10-05" })).resolves.toMatchObject({ date: "2026-10-05" });
    expect(db.outsideActivity.create).toHaveBeenCalledTimes(1);
  });
});

describe("remove", () => {
  it("deletes only the athlete's own row in the viewed week", async () => {
    const { caller, db } = makeCaller({ found: { id: "a1", date: D("2026-10-08") } });
    await expect(caller.remove({ weekIndex: 1, id: "a1" })).resolves.toEqual({ removed: true });
    const where = (db.outsideActivity.findFirst.mock.calls[0]![0] as { where: unknown }).where;
    expect(where).toMatchObject({ id: "a1", athleteProfileId: "profile-1" });
    expect(db.outsideActivity.delete).toHaveBeenCalledWith({ where: { id: "a1" } });
  });

  it("is NOT_FOUND for a row that isn't the athlete's, and deletes nothing", async () => {
    const { caller, db } = makeCaller({ found: null });
    await expect(caller.remove({ weekIndex: 1, id: "someone-elses" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.outsideActivity.delete).not.toHaveBeenCalled();
  });

  it("refuses a row outside the viewed week with BAD_REQUEST", async () => {
    const { caller, db } = makeCaller({ found: { id: "a9", date: D("2026-10-13") } });
    await expect(caller.remove({ weekIndex: 1, id: "a9" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.outsideActivity.delete).not.toHaveBeenCalled();
  });
});
