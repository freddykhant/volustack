import { describe, expect, it, vi } from "vitest";
import { upcomingCueInputs } from "./day-input";

// Block started Mon 5 Oct 2026 (UTC), 2 weeks long. Sessions are placed by dayOfWeek
// (0 = Mon … 6 = Sun), so Tue 6 Oct is day 1 and Wed 7 Oct is day 2.
const START = new Date("2026-10-05T00:00:00Z");
const D = (iso: string) => new Date(`${iso}T00:00:00Z`);

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
        // A squat loads QUADS, so the session's footprint is lower-body.
        exercise: { id: "e1", name: "Barbell Back Squat", movementPattern: "SQUAT", equipment: "BARBELL", contraindications: [] },
      },
    ],
  };
}

function weekRow(index: number, sessions: ReturnType<typeof sessionRow>[]) {
  return { id: `wk-${index}`, mesocycleId: "meso-1", index, isDeload: false, sessions };
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

const activityRow = (id: string, iso: string, kind: ActivityRow["kind"] = "RUN"): ActivityRow => ({
  id,
  date: D(iso),
  daypart: "AM",
  kind,
  intensity: "HARD",
  durationMin: 45,
  createdAt: START,
});

interface Opts {
  noBlock?: boolean;
  weeks?: ReturnType<typeof weekRow>[];
  timezone?: string;
  weightKg?: number | null;
  phase?: "CUT" | "MAINTAIN" | "BULK";
  activities?: ActivityRow[];
}

function makeDb(opts: Opts = {}) {
  const meso = {
    startDate: START,
    lengthWeeks: 2,
    athleteProfile: {
      id: "profile-1",
      scheduleMode: "DAY",
      timezone: opts.timezone ?? "UTC",
      weightKg: opts.weightKg === undefined ? 80 : opts.weightKg,
      phase: opts.phase ?? "MAINTAIN",
      availability: [],
      availabilityExceptions: [],
    },
    weeks: opts.weeks ?? [weekRow(1, []), weekRow(2, [])],
  };
  return {
    mesocycle: { findFirst: vi.fn().mockResolvedValue(opts.noBlock ? null : meso) },
    outsideActivity: { findMany: vi.fn().mockResolvedValue(opts.activities ?? []) },
  };
}

const run = (db: ReturnType<typeof makeDb>, now: Date) =>
  upcomingCueInputs(db as unknown as Parameters<typeof upcomingCueInputs>[0], "user-1", now);

const ids = (lifts: { id: string }[]) => lifts.map((l) => l.id);

describe("upcomingCueInputs", () => {
  it("today's lifts are the day's SCHEDULED sessions only", async () => {
    const db = makeDb({
      weeks: [
        weekRow(1, [sessionRow("s1", "wk-1", 0, "Legs A", 1), sessionRow("s2", "wk-1", 1, "Legs B", 1, "COMPLETED")]),
        weekRow(2, []),
      ],
    });
    const [today, tomorrow] = await run(db, new Date("2026-10-06T08:00:00Z"));
    expect(today!.when).toBe("today");
    expect(today!.input.date).toBe("2026-10-06");
    expect(ids(today!.input.lifts)).toEqual(["s1"]);
    expect(today!.input.lifts[0]).toMatchObject({ id: "s1", label: "Legs A", daypart: null });
    expect(today!.input.lifts[0]!.footprint.QUADS).toBeGreaterThan(0);
    expect(tomorrow!.when).toBe("tomorrow");
    expect(tomorrow!.input.date).toBe("2026-10-07");
    expect(tomorrow!.input.lifts).toEqual([]);
  });

  it("tomorrow on the next block week's first day comes from that week's layout", async () => {
    const db = makeDb({
      weeks: [weekRow(1, []), weekRow(2, [sessionRow("t1", "wk-2", 0, "Legs A", 0)])],
    });
    const [today, tomorrow] = await run(db, new Date("2026-10-11T20:00:00Z"));
    expect(today!.input.date).toBe("2026-10-11");
    expect(tomorrow!.input.date).toBe("2026-10-12");
    expect(ids(tomorrow!.input.lifts)).toEqual(["t1"]);
  });

  it("a day past the block's end has no lifts and does not throw", async () => {
    const db = makeDb({
      weeks: [weekRow(1, []), weekRow(2, [sessionRow("t1", "wk-2", 0, "Legs A", 6)])],
    });
    const [today, tomorrow] = await run(db, new Date("2026-10-18T20:00:00Z"));
    expect(today!.input.date).toBe("2026-10-18");
    expect(ids(today!.input.lifts)).toEqual(["t1"]);
    expect(tomorrow!.input.date).toBe("2026-10-19");
    expect(tomorrow!.input.lifts).toEqual([]);
  });

  it("yesterday's lifts count only if done; today's planned lifts count as tomorrow's previous day", async () => {
    const db = makeDb({
      weeks: [
        weekRow(1, [
          sessionRow("s1", "wk-1", 0, "Legs A", 1), // Tue, overdue
          sessionRow("s2", "wk-1", 1, "Legs B", 1, "COMPLETED"), // Tue, done
          sessionRow("s3", "wk-1", 2, "Legs C", 2), // Wed, today
        ]),
        weekRow(2, []),
      ],
    });
    const [today, tomorrow] = await run(db, new Date("2026-10-07T08:00:00Z"));
    expect(ids(today!.input.previous.lifts)).toEqual(["s2"]);
    expect(ids(today!.input.lifts)).toEqual(["s3"]);
    expect(ids(tomorrow!.input.previous.lifts)).toContain("s3");
    expect(ids(tomorrow!.input.lifts)).toEqual([]);
  });

  it("uses the athlete's local date", async () => {
    // Sydney is UTC+11 in October: 14:30Z on Tue 6 Oct is 01:30 on Wed 7 Oct there.
    const db = makeDb({ timezone: "Australia/Sydney" });
    const [today, tomorrow] = await run(db, new Date("2026-10-06T14:30:00Z"));
    expect(today!.input.date).toBe("2026-10-07");
    expect(tomorrow!.input.date).toBe("2026-10-08");
  });

  it("reads activities for yesterday through tomorrow and maps them per date", async () => {
    const db = makeDb({
      activities: [activityRow("a6", "2026-10-06", "RUN"), activityRow("a7", "2026-10-07", "RIDE"), activityRow("a8", "2026-10-08", "SWIM")],
    });
    const [today, tomorrow] = await run(db, new Date("2026-10-07T08:00:00Z"));

    const call = db.outsideActivity.findMany.mock.calls[0]![0] as { where: { athleteProfileId: string; date: unknown } };
    expect(call.where.athleteProfileId).toBe("profile-1");
    expect(call.where.date).toEqual({ gte: D("2026-10-06"), lte: D("2026-10-08") });

    expect(today!.input.activities).toEqual([{ id: "a7", kind: "RIDE", intensity: "HARD", daypart: "AM", durationMin: 45 }]);
    expect(today!.input.previous.activities.map((a) => a.id)).toEqual(["a6"]);
    expect(tomorrow!.input.activities.map((a) => a.id)).toEqual(["a8"]);
    expect(tomorrow!.input.previous.activities.map((a) => a.id)).toEqual(["a7"]);
  });

  it("carries weightKg and phase from the profile", async () => {
    const db = makeDb({ weightKg: 72.5, phase: "CUT" });
    const days = await run(db, new Date("2026-10-07T08:00:00Z"));
    for (const d of days) {
      expect(d.input.weightKg).toBe(72.5);
      expect(d.input.phase).toBe("CUT");
    }
    const unknown = await run(makeDb({ weightKg: null }), new Date("2026-10-07T08:00:00Z"));
    expect(unknown[0]!.input.weightKg).toBeNull();
  });

  it("returns [] when there is no active block", async () => {
    const db = makeDb({ noBlock: true });
    await expect(run(db, new Date("2026-10-07T08:00:00Z"))).resolves.toEqual([]);
    expect(db.outsideActivity.findMany).not.toHaveBeenCalled();
  });
});
