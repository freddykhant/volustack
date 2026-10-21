import "server-only";
import type { Prisma } from "../../../generated/prisma";
import { dayNumberOfIsoDate, isoDateOfDayNumber, localDayNumber, weekdayOfDayNumber } from "~/domain/local-day";
import { savedLayout, type CueActivity, type CueDayInput, type CueLift } from "~/engine";
import {
  availabilityFromRows,
  exceptionsFromRows,
  scheduleInputFromDb,
  WEEK_FOR_SCHEDULE_INCLUDE,
  type ScheduleSettings,
} from "~/server/mesocycle/schedule-adapters";
import type { CueWhen } from "~/views/cues";

type Tx = Prisma.TransactionClient;
type Status = "SCHEDULED" | "COMPLETED" | "MISSED";

/**
 * What cues need for today and tomorrow, in the athlete's timezone. Reads the active
 * block's weeks (blocks are short, so all of them) and the outside activities from the
 * day before today to tomorrow. Scheduling never calls this: activities stay out of it.
 */
export async function upcomingCueInputs(
  db: Pick<Tx, "mesocycle" | "outsideActivity">,
  userId: string,
  now: Date,
): Promise<{ when: CueWhen; input: CueDayInput }[]> {
  const meso = await db.mesocycle.findFirst({
    where: { status: "ACTIVE", athleteProfile: { userId } },
    orderBy: { createdAt: "desc" },
    select: {
      startDate: true,
      lengthWeeks: true,
      athleteProfile: {
        select: {
          id: true,
          scheduleMode: true,
          timezone: true,
          weightKg: true,
          phase: true,
          availability: true,
          availabilityExceptions: true,
        },
      },
      weeks: { include: WEEK_FOR_SCHEDULE_INCLUDE },
    },
  });
  if (!meso) return [];

  const profile = meso.athleteProfile;
  const tz = profile.timezone;
  const startDate = meso.startDate ?? now;
  const settings: ScheduleSettings = {
    mode: profile.scheduleMode,
    availability: availabilityFromRows(profile.availability),
    timezone: tz,
  };
  const exceptions = exceptionsFromRows(profile.availabilityExceptions);
  const start = localDayNumber(startDate, tz);
  const today = localDayNumber(now, tz);

  const rows = await db.outsideActivity.findMany({
    where: {
      athleteProfileId: profile.id,
      date: {
        gte: new Date(`${isoDateOfDayNumber(today - 1)}T00:00:00Z`),
        lte: new Date(`${isoDateOfDayNumber(today + 1)}T00:00:00Z`),
      },
    },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });
  const activitiesOn = (n: number): CueActivity[] =>
    rows
      .filter((r) => dayNumberOfIsoDate(r.date.toISOString().slice(0, 10)) === n)
      .map((r) => ({ id: r.id, kind: r.kind, intensity: r.intensity, daypart: r.daypart, durationMin: r.durationMin }));

  const liftsOn = (n: number, statuses: Status[]): CueLift[] => {
    const weekIndex = Math.floor((n - start) / 7) + 1;
    if (n < start || weekIndex > meso.lengthWeeks) return [];
    const week = meso.weeks.find((w) => w.index === weekIndex);
    if (!week) return [];
    const input = scheduleInputFromDb({
      week,
      prevWeek: meso.weeks.find((w) => w.index === weekIndex - 1) ?? null,
      settings,
      startDate,
      exceptions,
      now,
    });
    const layout = savedLayout(input);
    const weekday = weekdayOfDayNumber(n);
    return [...week.sessions]
      .sort((a, b) => a.order - b.order)
      .filter((s) => statuses.includes(s.status) && layout[s.id]?.day === weekday)
      .map((s) => ({
        id: s.id,
        label: s.splitSlot,
        daypart: layout[s.id]!.daypart ?? null,
        footprint: input.sessions.find((x) => x.id === s.id)?.footprint ?? {},
      }));
  };

  const day = (n: number): CueDayInput => ({
    date: isoDateOfDayNumber(n),
    lifts: liftsOn(n, ["SCHEDULED"]),
    activities: activitiesOn(n),
    previous: {
      // A day that has passed counts only what was done; a day still to come counts its plan.
      lifts: liftsOn(n - 1, n - 1 < today ? ["COMPLETED"] : ["SCHEDULED", "COMPLETED"]),
      activities: activitiesOn(n - 1),
    },
    weightKg: profile.weightKg,
    phase: profile.phase,
  });
  return [
    { when: "today", input: day(today) },
    { when: "tomorrow", input: day(today + 1) },
  ];
}
