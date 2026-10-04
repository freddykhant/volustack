import { describe, expect, it, vi } from "vitest";
import { createCallerFactory } from "~/server/api/trpc";
import { scheduleRouter } from "./schedule";

const createCaller = createCallerFactory(scheduleRouter);

interface Opts {
  mode?: "DAY" | "HALF_DAY";
  noProfile?: boolean;
  scheduled?: { id: string; weekId: string; dayOfWeek: number; week: { index: number } }[];
}

function makeCaller(opts: Opts = {}) {
  const profile = opts.noProfile
    ? null
    : { id: "ap-1", scheduleMode: opts.mode ?? "DAY", timezone: "UTC", availability: [{ dayOfWeek: 6, daypart: "AM", state: "BLOCKED" }] };
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
