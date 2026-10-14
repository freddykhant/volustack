import { describe, expect, it, vi } from "vitest";
import { SUGGESTION_MIN_GAIN } from "~/engine/constants";
import { savedLayout, suggestMoves } from "~/engine";
import { loadWeekContext } from "~/server/schedule/week-context";
import { toMoveSuggestionView } from "~/views/schedule";
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

const THURSDAY = [
  { date: new Date("2026-10-08T00:00:00Z"), daypart: "AM" as const },
  { date: new Date("2026-10-08T00:00:00Z"), daypart: "PM" as const },
];

async function contextFor(sessions: ReturnType<typeof sessionRow>[], exceptions: { date: Date; daypart: "AM" | "PM" }[] = []) {
  const meso = {
    id: "meso-1",
    startDate: START,
    lengthWeeks: 4,
    athleteProfile: { id: "profile-1", scheduleMode: "DAY", timezone: "UTC", availability: [], availabilityExceptions: exceptions },
    weeks: [{ id: "wk-1", mesocycleId: "meso-1", index: 1, isDeload: false, sessions }],
  };
  const db = { mesocycle: { findFirst: vi.fn().mockResolvedValue(meso) } };
  return loadWeekContext(db as never, "user-1", 1, NOW);
}

async function weekFor(
  sessions: ReturnType<typeof sessionRow>[],
  exceptions: { date: Date; daypart: "AM" | "PM" }[] = [],
  suggestionDismissed = false,
) {
  const c = await contextFor(sessions, exceptions);
  return coachWeekFrom(c, { now: NOW, readiness: null, suggestionDismissed });
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

  describe("suggestion", () => {
    // Two sessions on consecutive days that train the same muscles: the engine wants them apart.
    const tight = () => [sessionRow("a", 0, "Upper A", 3), sessionRow("b", 1, "Upper B", 4)];

    it("relays the engine's top suggestion", async () => {
      const c = await contextFor(tight());
      const top = suggestMoves(c.input, savedLayout(c.input))[0];
      expect(top).toBeDefined();
      expect(top!.gain).toBeGreaterThan(SUGGESTION_MIN_GAIN);
      const view = toMoveSuggestionView(top!, c.label);
      const week = coachWeekFrom(c, { now: NOW, readiness: null, suggestionDismissed: false });
      expect(week.suggestion).toEqual({ headline: view.headline, reasons: view.reasons });
      expect(view.headline).toMatch(/^(Move|Swap) /);
      expect(view.reasons.length).toBeGreaterThan(0);
    });

    it("offers none while the week is stranded", async () => {
      const week = await weekFor(tight(), THURSDAY);
      expect(week.stranded).toBe(true);
      expect(week.suggestion).toBeNull();
    });

    it("offers none once the athlete dismissed it", async () => {
      const week = await weekFor(tight(), [], true);
      expect(week.stranded).toBe(false);
      expect(week.suggestion).toBeNull();
    });
  });

  it("gives the model no session id", async () => {
    const week = await weekFor([sessionRow("sess-secret-1", 0, "Upper A", 3), sessionRow("sess-secret-2", 1, "Upper B", 5)]);
    const json = JSON.stringify(toModelContext(week));
    expect(json).toContain("Upper A");
    expect(json).not.toContain("sess-secret");
  });
});
