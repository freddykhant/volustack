import { describe, expect, it } from "vitest";
import type { SessionView, WeekView } from "~/views/types";
import { nextSession } from "~/views/next-session";

function weekWith(sessions: SessionView[]): WeekView {
  return { index: 1, isDeload: false, isCurrent: true, totalSets: 0, sessions, cells: [], days: [] };
}

const session = (slotId: string, status: SessionView["status"] = "SCHEDULED"): SessionView => ({
  slotId,
  label: slotId,
  estimatedMinutes: 40,
  status,
  prescriptions: [],
});

describe("nextSession", () => {
  it("returns the first session of the week", () => {
    const week = weekWith([session("upper-a"), session("lower-a")]);
    expect(nextSession(week)?.slotId).toBe("upper-a");
  });

  it("returns undefined when the week has no sessions", () => {
    expect(nextSession(weekWith([]))).toBeUndefined();
  });

  it("skips sessions that are already completed or missed", () => {
    const week = weekWith([session("upper-a", "COMPLETED"), session("lower-a", "MISSED"), session("upper-b")]);
    expect(nextSession(week)?.slotId).toBe("upper-b");
  });

  it("returns undefined when nothing is left to train", () => {
    expect(nextSession(weekWith([session("upper-a", "COMPLETED")]))).toBeUndefined();
  });
});
