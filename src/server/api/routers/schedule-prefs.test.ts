import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createCallerFactory } from "~/server/api/trpc";
import { scheduleRouter } from "./schedule";

const createCaller = createCallerFactory(scheduleRouter);

// Wednesday 7 Oct 2026 (UTC). The default block started Monday 5 Oct, so week 1 is current
// and week 2 is in the future. Fake only Date: tRPC's dev timing middleware awaits a real setTimeout.
const NOW = new Date("2026-10-07T02:00:00Z");
const START = new Date("2026-10-05T00:00:00Z");
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterAll(() => {
  vi.useRealTimers();
});

interface Opts {
  mode?: "DAY" | "HALF_DAY";
  noProfile?: boolean;
  /** The athlete has no ACTIVE block: the lock query returns no row. */
  noBlock?: boolean;
  startDate?: Date;
  timezone?: string;
  scheduled?: { id: string; weekId: string; dayOfWeek: number; week: { index: number } }[];
}

function makeCaller(opts: Opts = {}) {
  const profile = opts.noProfile
    ? null
    : { id: "ap-1", scheduleMode: opts.mode ?? "DAY", timezone: opts.timezone ?? "UTC", availability: [{ dayOfWeek: 6, daypart: "AM", state: "BLOCKED" }] };
  const db = {
    athleteProfile: {
      findUnique: vi.fn().mockResolvedValue(profile),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    availabilityCell: { deleteMany: vi.fn().mockResolvedValue({}), createMany: vi.fn().mockResolvedValue({}) },
    trainingSession: {
      findMany: vi.fn().mockResolvedValue(opts.scheduled ?? []),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({}),
    },
    mesocycle: { findUnique: vi.fn().mockResolvedValue({ startDate: opts.startDate ?? START, lengthWeeks: 4 }) },
    $queryRaw: vi.fn().mockResolvedValue(opts.noBlock ? [] : [{ id: "meso-1" }]),
    $transaction: vi.fn(),
  };
  db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) => fn(db));
  const caller = createCaller({ db, session: { user: { id: "user-1" } } } as unknown as Parameters<typeof createCaller>[0]);
  return { caller, db };
}

describe("getPrefs", () => {
  it("returns the stored settings in engine shape", async () => {
    const { caller } = makeCaller({ mode: "HALF_DAY" });
    expect(await caller.getPrefs()).toEqual({
      scheduleMode: "HALF_DAY",
      timezone: "UTC",
      availability: [{ day: 6, daypart: "AM", state: "BLOCKED" }],
    });
  });

  it("returns defaults before the athlete has a profile", async () => {
    const { caller } = makeCaller({ noProfile: true });
    expect(await caller.getPrefs()).toEqual({ scheduleMode: "DAY", timezone: "UTC", availability: [] });
  });
});

describe("updatePrefs", () => {
  it("replaces the availability grid and never touches a session when the mode is unchanged", async () => {
    const { caller, db } = makeCaller();
    await caller.updatePrefs({ scheduleMode: "DAY", availability: [{ day: 2, daypart: "PM", state: "PREFERRED" }] });
    expect(db.availabilityCell.deleteMany).toHaveBeenCalledWith({ where: { athleteProfileId: "ap-1" } });
    expect(db.availabilityCell.createMany).toHaveBeenCalledWith({
      data: [{ athleteProfileId: "ap-1", dayOfWeek: 2, daypart: "PM", state: "PREFERRED" }],
    });
    expect(db.trainingSession.update).not.toHaveBeenCalled();
    expect(db.trainingSession.updateMany).not.toHaveBeenCalled();
  });

  it("refuses AM/PM → one-a-day while a day holds two scheduled sessions, naming it", async () => {
    const { caller, db } = makeCaller({
      mode: "HALF_DAY",
      scheduled: [
        { id: "a", weekId: "wk-2", dayOfWeek: 1, week: { index: 2 } },
        { id: "b", weekId: "wk-2", dayOfWeek: 1, week: { index: 2 } },
        { id: "c", weekId: "wk-2", dayOfWeek: 3, week: { index: 2 } },
      ],
    });
    await expect(caller.updatePrefs({ scheduleMode: "DAY", availability: [] })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("Tue in week 2") as unknown,
    });
    expect(db.athleteProfile.update).not.toHaveBeenCalled();
    expect(db.trainingSession.updateMany).not.toHaveBeenCalled();
  });

  it("clears dayparts on AM/PM → one-a-day without changing any day", async () => {
    const { caller, db } = makeCaller({
      mode: "HALF_DAY",
      scheduled: [{ id: "a", weekId: "wk-2", dayOfWeek: 1, week: { index: 2 } }],
    });
    await caller.updatePrefs({ scheduleMode: "DAY", availability: [] });
    const call = db.trainingSession.updateMany.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(call.data).toEqual({ daypart: null });
    expect(db.athleteProfile.update).toHaveBeenCalledWith({ where: { id: "ap-1" }, data: { scheduleMode: "DAY" } });
  });

  it("assigns a daypart on one-a-day → AM/PM from the new availability, without changing any day", async () => {
    const { caller, db } = makeCaller({
      mode: "DAY",
      scheduled: [
        { id: "a", weekId: "wk-2", dayOfWeek: 1, week: { index: 2 } },
        { id: "b", weekId: "wk-2", dayOfWeek: 3, week: { index: 2 } },
      ],
    });
    await caller.updatePrefs({ scheduleMode: "HALF_DAY", availability: [{ day: 3, daypart: "PM", state: "PREFERRED" }] });
    expect(db.trainingSession.update).toHaveBeenCalledWith({ where: { id: "a" }, data: { daypart: "AM" } });
    expect(db.trainingSession.update).toHaveBeenCalledWith({ where: { id: "b" }, data: { daypart: "PM" } });
  });

  it("is NOT_FOUND without a profile", async () => {
    const { caller } = makeCaller({ noProfile: true });
    await expect(caller.updatePrefs({ scheduleMode: "DAY", availability: [] })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("locks the active block before reading the profile and before any write", async () => {
    const { caller, db } = makeCaller({
      mode: "HALF_DAY",
      scheduled: [{ id: "a", weekId: "wk-2", dayOfWeek: 1, week: { index: 2 } }],
    });
    await caller.updatePrefs({ scheduleMode: "DAY", availability: [{ day: 2, daypart: "PM", state: "PREFERRED" }] });
    const lock = db.$queryRaw.mock.invocationCallOrder[0]!;
    expect(lock).toBeLessThan(db.athleteProfile.findUnique.mock.invocationCallOrder[0]!);
    expect(lock).toBeLessThan(db.trainingSession.updateMany.mock.invocationCallOrder[0]!);
    expect(lock).toBeLessThan(db.availabilityCell.deleteMany.mock.invocationCallOrder[0]!);
    expect(lock).toBeLessThan(db.availabilityCell.createMany.mock.invocationCallOrder[0]!);
    expect(lock).toBeLessThan(db.athleteProfile.update.mock.invocationCallOrder[0]!);
  });

  it("saves the preferences without touching sessions when there is no active block", async () => {
    const { caller, db } = makeCaller({ mode: "HALF_DAY", noBlock: true });
    await caller.updatePrefs({ scheduleMode: "DAY", availability: [{ day: 2, daypart: "PM", state: "PREFERRED" }] });
    expect(db.availabilityCell.deleteMany).toHaveBeenCalledWith({ where: { athleteProfileId: "ap-1" } });
    expect(db.availabilityCell.createMany).toHaveBeenCalledTimes(1);
    expect(db.athleteProfile.update).toHaveBeenCalledWith({ where: { id: "ap-1" }, data: { scheduleMode: "DAY" } });
    expect(db.trainingSession.findMany).not.toHaveBeenCalled();
    expect(db.trainingSession.update).not.toHaveBeenCalled();
    expect(db.trainingSession.updateMany).not.toHaveBeenCalled();
  });

  it("is not blocked by a clash in a finished week, and still clears dayparts", async () => {
    // Block started Mon 14 Sep: on 7 Oct the current week is 4, so week 2 is finished.
    const { caller, db } = makeCaller({
      mode: "HALF_DAY",
      startDate: new Date("2026-09-14T00:00:00Z"),
      scheduled: [
        { id: "a", weekId: "wk-2", dayOfWeek: 1, week: { index: 2 } },
        { id: "b", weekId: "wk-2", dayOfWeek: 1, week: { index: 2 } },
        { id: "c", weekId: "wk-4", dayOfWeek: 3, week: { index: 4 } },
      ],
    });
    await caller.updatePrefs({ scheduleMode: "DAY", availability: [] });
    const call = db.trainingSession.updateMany.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(call.data).toEqual({ daypart: null });
    expect(db.athleteProfile.update).toHaveBeenCalledWith({ where: { id: "ap-1" }, data: { scheduleMode: "DAY" } });
  });

  it("counts the week by the athlete's calendar: a clash in the week that just finished does not block", async () => {
    // Block started Mon 5 Oct 20:00 Perth. It is now Mon 12 Oct 00:30 Perth (6d 4.5h later),
    // so week 1 is over and week 2 is the current one.
    vi.setSystemTime(new Date("2026-10-11T16:30:00Z"));
    try {
      const { caller, db } = makeCaller({
        mode: "HALF_DAY",
        timezone: "Australia/Perth",
        startDate: new Date("2026-10-05T12:00:00Z"),
        scheduled: [
          { id: "a", weekId: "wk-1", dayOfWeek: 4, week: { index: 1 } },
          { id: "b", weekId: "wk-1", dayOfWeek: 4, week: { index: 1 } },
        ],
      });
      await caller.updatePrefs({ scheduleMode: "DAY", availability: [] });
      expect(db.athleteProfile.update).toHaveBeenCalledWith({ where: { id: "ap-1" }, data: { scheduleMode: "DAY" } });
    } finally {
      vi.setSystemTime(NOW);
    }
  });

  it("is still blocked by a clash in the current week", async () => {
    const { caller, db } = makeCaller({
      mode: "HALF_DAY",
      scheduled: [
        { id: "a", weekId: "wk-1", dayOfWeek: 4, week: { index: 1 } },
        { id: "b", weekId: "wk-1", dayOfWeek: 4, week: { index: 1 } },
      ],
    });
    await expect(caller.updatePrefs({ scheduleMode: "DAY", availability: [] })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("Fri in week 1") as unknown,
    });
    expect(db.athleteProfile.update).not.toHaveBeenCalled();
  });
});

describe("setTimezone", () => {
  it("stores a valid timezone for the signed-in athlete only", async () => {
    const { caller, db } = makeCaller();
    expect(await caller.setTimezone({ timezone: "Australia/Sydney" })).toEqual({ timezone: "Australia/Sydney" });
    expect(db.athleteProfile.updateMany).toHaveBeenCalledWith({ where: { userId: "user-1" }, data: { timezone: "Australia/Sydney" } });
  });

  it("rejects an invented timezone", async () => {
    const { caller } = makeCaller();
    await expect(caller.setTimezone({ timezone: "Mars/Olympus" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
