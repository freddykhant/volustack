import { describe, expect, it, vi } from "vitest";
import { loadWeekContext } from "~/server/schedule/week-context";
import { toModelContext } from "./context";
import { coachWeekFrom } from "./week";

vi.mock("server-only", () => ({}));

// Wednesday 7 Oct 2026 (UTC); the block started Monday 5 Oct.
const NOW = new Date("2026-10-07T02:00:00Z");
const START = new Date("2026-10-05T00:00:00Z");

type Status = "SCHEDULED" | "COMPLETED" | "MISSED";

function sessionRow(
  id: string,
  order: number,
  label: string,
  dayOfWeek: number | null,
  status: Status = "SCHEDULED",
  reps: { low: number | null; high: number | null } = { low: 6, high: 10 },
) {
  return {
    id,
    weekId: "wk-1",
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
        targetRepLow: reps.low,
        targetRepHigh: reps.high,
        targetRir: 2,
        exercise: { id: "e1", name: "Barbell Bench Press", movementPattern: "HORIZONTAL_PUSH", equipment: "BARBELL", contraindications: [] },
      },
    ],
  };
}

async function weekFor(sessions: ReturnType<typeof sessionRow>[], exceptions: { date: Date; daypart: "AM" | "PM" }[] = []) {
  const meso = {
    id: "meso-1",
    startDate: START,
    lengthWeeks: 4,
    athleteProfile: { id: "profile-1", scheduleMode: "DAY", timezone: "UTC", availability: [], availabilityExceptions: exceptions },
    weeks: [{ id: "wk-1", mesocycleId: "meso-1", index: 1, isDeload: false, sessions }],
  };
  const db = { mesocycle: { findFirst: vi.fn().mockResolvedValue(meso) } };
  const c = await loadWeekContext(db as never, "user-1", 1, NOW);
  return coachWeekFrom(c, { now: NOW, readiness: null });
}

describe("coachWeekFrom", () => {
  it("keys the sessions S1…Sn in board order, whatever order they arrive in", async () => {
    const week = await weekFor([
      sessionRow("c", 2, "Legs", 5),
      sessionRow("a", 0, "Upper A", 2),
      sessionRow("b", 1, "Upper B", 3),
    ]);
    expect(week.sessions.map((s) => [s.key, s.id, s.label])).toEqual([
      ["S1", "a", "Upper A"],
      ["S2", "b", "Upper B"],
      ["S3", "c", "Legs"],
    ]);
  });

  it("makes the earliest placed scheduled session the next one", async () => {
    const week = await weekFor([
      sessionRow("a", 0, "Upper A", 4),
      sessionRow("b", 1, "Upper B", 2),
      sessionRow("c", 2, "Legs", 0, "COMPLETED"),
    ]);
    expect(week.next).toEqual({
      label: "Upper B",
      placement: { day: 2, daypart: null },
      minutes: 60,
      first: { exerciseName: "Barbell Bench Press", sets: 4, repLow: 6, repHigh: 10 },
    });
  });

  it("has no next session when none is left to train", async () => {
    const week = await weekFor([sessionRow("a", 0, "Upper A", 0, "COMPLETED"), sessionRow("b", 1, "Upper B", 1, "MISSED")]);
    expect(week.next).toBeNull();
  });

  it("leaves out the first exercise when a rep target is missing", async () => {
    const low = await weekFor([sessionRow("a", 0, "Upper A", 3, "SCHEDULED", { low: null, high: 10 })]);
    expect(low.next).toMatchObject({ label: "Upper A", first: null });
    const high = await weekFor([sessionRow("a", 0, "Upper A", 3, "SCHEDULED", { low: 6, high: null })]);
    expect(high.next).toMatchObject({ label: "Upper A", first: null });
  });

  it("offers no suggestion while the week is stranded", async () => {
    const week = await weekFor(
      [sessionRow("a", 0, "Upper A", 3), sessionRow("b", 1, "Upper B", 5)],
      [
        { date: new Date("2026-10-08T00:00:00Z"), daypart: "AM" },
        { date: new Date("2026-10-08T00:00:00Z"), daypart: "PM" },
      ],
    );
    expect(week.stranded).toBe(true);
    expect(week.suggestion).toBeNull();
  });

  it("gives the model no session id", async () => {
    const week = await weekFor([sessionRow("sess-secret-1", 0, "Upper A", 3), sessionRow("sess-secret-2", 1, "Upper B", 5)]);
    const json = JSON.stringify(toModelContext(week));
    expect(json).toContain("Upper A");
    expect(json).not.toContain("sess-secret");
  });
});
