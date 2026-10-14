import { describe, expect, it } from "vitest";
import type { CoachWeek } from "~/domain/coach/resolve";
import { coachDates, toModelContext } from "./context";

describe("coachDates", () => {
  // Block starts Mon 5 Oct 2026 (UTC) and runs 3 weeks: last day Sun 25 Oct.
  const base = { startDate: new Date("2026-10-05T00:00:00Z"), lengthWeeks: 3, timezone: "UTC", standing: [], exceptions: [] };

  it("runs from today to the block's last day, with weekday and week number", () => {
    const dates = coachDates({ ...base, now: new Date("2026-10-14T09:00:00Z") });
    expect(dates[0]).toEqual({ date: "2026-10-14", weekday: 2, weekIndex: 2, am: null, pm: null });
    expect(dates.at(-1)).toMatchObject({ date: "2026-10-25", weekday: 6, weekIndex: 3 });
    expect(dates).toHaveLength(12);
  });

  it("marks standing and one-off blocks per half", () => {
    const dates = coachDates({
      ...base,
      now: new Date("2026-10-14T09:00:00Z"),
      standing: [{ day: 4, daypart: "AM", state: "BLOCKED" }, { day: 5, daypart: "AM", state: "PREFERRED" }],
      exceptions: [{ date: "2026-10-15", daypart: "PM" }, { date: "2026-10-16", daypart: "AM" }],
    });
    const at = (iso: string) => dates.find((d) => d.date === iso)!;
    expect(at("2026-10-15")).toMatchObject({ am: null, pm: "one_off" });
    // A standing block wins over an exception on the same half.
    expect(at("2026-10-16")).toMatchObject({ am: "standing", pm: null });
    expect(at("2026-10-17")).toMatchObject({ am: null, pm: null });
    expect(at("2026-10-23")).toMatchObject({ am: "standing" });
  });

  it("uses the athlete's local day for today", () => {
    // 23:30Z on Tue 13 Oct is already Wed 14 Oct in Perth; the block began Mon 5 Oct there.
    const dates = coachDates({
      ...base,
      startDate: new Date("2026-10-04T16:00:00Z"),
      timezone: "Australia/Perth",
      now: new Date("2026-10-13T23:30:00Z"),
    });
    expect(dates[0]).toMatchObject({ date: "2026-10-14", weekday: 2, weekIndex: 2 });
  });

  it("is empty once the block is over", () => {
    expect(coachDates({ ...base, now: new Date("2026-11-01T00:00:00Z") })).toEqual([]);
  });
});

describe("toModelContext", () => {
  const week: CoachWeek = {
    mode: "HALF_DAY",
    weekIndex: 2,
    dates: [
      { date: "2026-10-14", weekday: 2, weekIndex: 2, am: null, pm: null },
      { date: "2026-10-15", weekday: 3, weekIndex: 2, am: "one_off", pm: "standing" },
      { date: "2026-10-16", weekday: 4, weekIndex: 2, am: null, pm: "one_off" },
    ],
    sessions: [
      { key: "S1", id: "ckxyz-secret-1", label: "Upper A", status: "COMPLETED", placement: { day: 0, daypart: "AM" } },
      { key: "S2", id: "ckxyz-secret-2", label: "Legs", status: "SCHEDULED", placement: null },
    ],
    stranded: false,
    warnings: ["private warning text"],
    suggestion: null,
    next: null,
    readiness: { fitness: 1, fatigue: 2, form: -1, label: "Fatigued" },
    explain: () => null,
  };

  it("describes the week in words the model can use", () => {
    const ctx = toModelContext(week);
    expect(ctx.today).toBe("2026-10-14");
    expect(ctx.todayWeekday).toBe("Wednesday");
    expect(ctx.scheduleMode).toBe("morning or afternoon sessions");
    expect(ctx.viewedWeek).toBe(2);
    expect(ctx.dates).toEqual([
      { date: "2026-10-14", weekday: "Wednesday", week: 2, blocked: "no" },
      { date: "2026-10-15", weekday: "Thursday", week: 2, blocked: "all day" },
      { date: "2026-10-16", weekday: "Friday", week: 2, blocked: "afternoon" },
    ]);
    expect(ctx.sessions).toEqual([
      { key: "S1", label: "Upper A", day: "Monday", time: "morning", status: "done" },
      { key: "S2", label: "Legs", day: null, time: null, status: "scheduled" },
    ]);
  });

  it("carries no ids, warnings or readiness", () => {
    const json = JSON.stringify(toModelContext(week));
    expect(json).not.toContain("ckxyz");
    expect(json).not.toContain("private warning");
    expect(json).not.toContain("Fatigued");
  });
});
