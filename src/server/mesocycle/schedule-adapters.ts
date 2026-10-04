import type { Prisma } from "../../../generated/prisma";
import { EXERCISE_LIBRARY } from "~/domain/exercise-library";
import { isoDateOfDayNumber, localDayNumber, localHour, weekdayOfDayNumber } from "~/domain/local-day";
import {
  footprintOf,
  placeWeek,
  placementPosition,
  type AvailabilityCellInput,
  type CarryIn,
  type Layout,
  type MesocyclePlan,
  type Placement,
  type ScheduleInput,
} from "~/engine";
import type { AvailabilityState, Daypart, ScheduleMode } from "~/schema";

export interface WeekDay {
  date: string; // "YYYY-MM-DD", the athlete's local date
  weekday: number; // 0 = Mon … 6 = Sun
}

/** The athlete's scheduling settings, as the engine needs them. */
export interface ScheduleSettings {
  mode: ScheduleMode;
  availability: AvailabilityCellInput[];
  timezone: string;
}

export const WEEK_FOR_SCHEDULE_INCLUDE = {
  sessions: { include: { prescriptions: { include: { exercise: true } } } },
} satisfies Prisma.WeekInclude;

export type WeekForSchedule = Prisma.WeekGetPayload<{ include: typeof WEEK_FOR_SCHEDULE_INCLUDE }>;

/** The seven local dates of a block week. Weeks are rolling: week 1 starts on the block's start date. */
export function weekDays(startDate: Date, weekIndex: number, tz: string): WeekDay[] {
  const first = localDayNumber(startDate, tz) + (weekIndex - 1) * 7;
  return Array.from({ length: 7 }, (_, i) => ({
    date: isoDateOfDayNumber(first + i),
    weekday: weekdayOfDayNumber(first + i),
  }));
}

/** Index (0..7) of today within a block week. 0 for a future week, 7 for a finished one. */
export function firstOpenDay(startDate: Date, weekIndex: number, tz: string, now: Date): number {
  const elapsed = localDayNumber(now, tz) - localDayNumber(startDate, tz) - (weekIndex - 1) * 7;
  return Math.min(Math.max(elapsed, 0), 7);
}

export function availabilityFromRows(
  rows: { dayOfWeek: number; daypart: Daypart; state: AvailabilityState }[],
): AvailabilityCellInput[] {
  return rows.map((r) => ({ day: r.dayOfWeek, daypart: r.daypart, state: r.state }));
}

function placementOf(s: { dayOfWeek: number | null; daypart: Daypart | null }): Placement | null {
  return s.dayOfWeek === null ? null : { day: s.dayOfWeek, daypart: s.daypart };
}

function footprintOfSession(s: WeekForSchedule["sessions"][number]) {
  return footprintOf(
    s.prescriptions.map((p) => ({ exerciseName: p.exercise.name, sets: p.sets })),
    EXERCISE_LIBRARY,
  );
}

/**
 * Persisted week → the engine's ScheduleInput. Session id = TrainingSession.id, so a
 * layout maps straight back to rows. A session is locked once it is no longer SCHEDULED.
 */
export function scheduleInputFromDb(args: {
  week: WeekForSchedule;
  prevWeek: WeekForSchedule | null;
  settings: ScheduleSettings;
  startDate: Date;
  now: Date;
}): ScheduleInput {
  const { week, prevWeek, settings, startDate, now } = args;
  const weekStartDay = weekDays(startDate, week.index, settings.timezone)[0]!.weekday;

  const carryIn: CarryIn[] = [];
  for (const s of prevWeek?.sessions ?? []) {
    const p = placementOf(s);
    if (!p) continue;
    carryIn.push({
      footprint: footprintOfSession(s),
      halfDaysBeforeWeekStart: 14 - placementPosition(p, weekStartDay),
    });
  }

  return {
    mode: settings.mode,
    weekStartDay,
    availability: settings.availability,
    carryIn,
    firstOpenDay: firstOpenDay(startDate, week.index, settings.timezone, now),
    sessions: [...week.sessions]
      .sort((a, b) => a.order - b.order)
      .map((s) => ({
        id: s.id,
        order: s.order,
        footprint: footprintOfSession(s),
        locked: s.status !== "SCHEDULED",
        placement: placementOf(s),
      })),
  };
}

/** Write placements. Touches only `dayOfWeek` and `daypart`: never a prescription. */
export async function applyLayoutToDb(tx: Prisma.TransactionClient, layout: Layout): Promise<void> {
  for (const [id, p] of Object.entries(layout)) {
    await tx.trainingSession.update({ where: { id }, data: { dayOfWeek: p.day, daypart: p.daypart } });
  }
}

/** Where a session that was actually completed belongs: its local weekday and half. */
export function completedPlacement(completedAt: Date, tz: string, mode: ScheduleMode): Placement {
  const day = weekdayOfDayNumber(localDayNumber(completedAt, tz));
  if (mode === "DAY") return { day, daypart: null };
  return { day, daypart: localHour(completedAt, tz) < 12 ? "AM" : "PM" };
}

/**
 * Place every week of a freshly generated plan. Sessions have no ids yet, so each
 * layout is keyed by the session's index in `week.sessions`. A week that cannot be
 * placed yields null and the block is still created (the board offers an Unplaced tray).
 */
export function placePlanWeeks(
  plan: MesocyclePlan,
  settings: ScheduleSettings,
  startDate: Date,
  now: Date,
): (Layout | null)[] {
  const out: (Layout | null)[] = [];
  let prev: { layout: Layout; footprints: ReturnType<typeof footprintOf>[] } | null = null;

  for (const week of [...plan.weeks].sort((a, b) => a.index - b.index)) {
    const weekStartDay = weekDays(startDate, week.index, settings.timezone)[0]!.weekday;
    const footprints = week.sessions.map((s) =>
      footprintOf(
        s.prescriptions.map((p) => ({ exerciseName: p.exerciseName, sets: p.sets })),
        EXERCISE_LIBRARY,
      ),
    );
    const carryIn: CarryIn[] = prev
      ? Object.entries(prev.layout).map(([id, p]) => ({
          footprint: prev!.footprints[Number(id)] ?? {},
          halfDaysBeforeWeekStart: 14 - placementPosition(p, weekStartDay),
        }))
      : [];

    const res = placeWeek({
      mode: settings.mode,
      weekStartDay,
      availability: settings.availability,
      carryIn,
      firstOpenDay: firstOpenDay(startDate, week.index, settings.timezone, now),
      sessions: week.sessions.map((_, i) => ({
        id: String(i),
        order: i,
        footprint: footprints[i]!,
        locked: false,
        placement: null,
      })),
    });

    if (res.kind === "placed") {
      out.push(res.layout);
      prev = { layout: res.layout, footprints };
    } else {
      out.push(null);
      prev = null;
    }
  }
  return out;
}
