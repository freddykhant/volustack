import { isoDateOfDayNumber, localDayNumber, weekdayOfDayNumber } from "~/domain/local-day";
import type { BlockSource, CoachDate, CoachWeek } from "~/domain/coach/resolve";
import type { AvailabilityCellInput } from "~/engine";
import type { ExceptionCell } from "~/server/mesocycle/schedule-adapters";
import { DAY_FULL } from "~/views/coach";

/**
 * Every date the athlete can still act on: today (their local day) to the block's last
 * day, with how each half is blocked. A standing block wins over an exception, as it does
 * on the board.
 */
export function coachDates(args: {
  startDate: Date;
  lengthWeeks: number;
  timezone: string;
  now: Date;
  standing: AvailabilityCellInput[];
  exceptions: ExceptionCell[];
}): CoachDate[] {
  const start = localDayNumber(args.startDate, args.timezone);
  const today = localDayNumber(args.now, args.timezone);
  const end = start + args.lengthWeeks * 7; // exclusive
  const oneOff = new Set(args.exceptions.map((e) => `${e.date}:${e.daypart}`));
  const out: CoachDate[] = [];
  for (let n = Math.max(today, start); n < end; n++) {
    const date = isoDateOfDayNumber(n);
    const weekday = weekdayOfDayNumber(n);
    const half = (daypart: "AM" | "PM"): BlockSource =>
      args.standing.some((c) => c.day === weekday && c.daypart === daypart && c.state === "BLOCKED" && c.oneOff !== true)
        ? "standing"
        : oneOff.has(`${date}:${daypart}`)
          ? "one_off"
          : null;
    out.push({ date, weekday, weekIndex: Math.floor((n - start) / 7) + 1, am: half("AM"), pm: half("PM") });
  }
  return out;
}

/** What the language model is shown. No ids, no warnings, no readiness: only what it needs
 * to turn a sentence into dates and a session key. */
export interface ModelContext {
  today: string;
  todayWeekday: string;
  scheduleMode: string;
  viewedWeek: number;
  dates: { date: string; weekday: string; week: number; blocked: "no" | "morning" | "afternoon" | "all day" }[];
  sessions: {
    key: string;
    label: string;
    day: string | null;
    time: "morning" | "afternoon" | null;
    status: "scheduled" | "done" | "missed";
  }[];
}

const STATUS = { SCHEDULED: "scheduled", COMPLETED: "done", MISSED: "missed" } as const;

export function toModelContext(week: CoachWeek): ModelContext {
  const first = week.dates[0];
  return {
    today: first?.date ?? "",
    todayWeekday: first ? (DAY_FULL[first.weekday] ?? "") : "",
    scheduleMode: week.mode === "HALF_DAY" ? "morning or afternoon sessions" : "one session a day",
    viewedWeek: week.weekIndex,
    dates: week.dates.map((d) => ({
      date: d.date,
      weekday: DAY_FULL[d.weekday] ?? "",
      week: d.weekIndex,
      blocked: d.am !== null && d.pm !== null ? "all day" : d.am !== null ? "morning" : d.pm !== null ? "afternoon" : "no",
    })),
    sessions: week.sessions.map((s) => ({
      key: s.key,
      label: s.label,
      day: s.placement ? (DAY_FULL[s.placement.day] ?? null) : null,
      time: s.placement?.daypart === "AM" ? "morning" : s.placement?.daypart === "PM" ? "afternoon" : null,
      status: STATUS[s.status],
    })),
  };
}
