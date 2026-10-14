import { TRPCError } from "@trpc/server";
import type { Prisma } from "../../../generated/prisma";
import { layoutKey, savedLayout } from "~/engine";
import {
  availabilityFromRows,
  exceptionsFromRows,
  scheduleInputFromDb,
  weekDays,
  WEEK_FOR_SCHEDULE_INCLUDE,
  type ScheduleSettings,
} from "~/server/mesocycle/schedule-adapters";
import { currentWeekIndex } from "~/server/views/to-mesocycle-view";

type Tx = Prisma.TransactionClient;

/** Everything about one week of the signed-in athlete's ACTIVE block that scheduling
 * needs. Throws NOT_FOUND when the block or the week isn't theirs. */
export async function loadWeekContext(db: Pick<Tx, "mesocycle">, userId: string, weekIndex: number, now: Date) {
  const meso = await db.mesocycle.findFirst({
    where: { status: "ACTIVE", athleteProfile: { userId } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      startDate: true,
      lengthWeeks: true,
      athleteProfile: {
        select: { id: true, scheduleMode: true, timezone: true, availability: true, availabilityExceptions: true },
      },
      weeks: { where: { index: { in: [weekIndex - 1, weekIndex] } }, include: WEEK_FOR_SCHEDULE_INCLUDE },
    },
  });
  if (!meso) throw new TRPCError({ code: "NOT_FOUND" });
  const week = meso.weeks.find((w) => w.index === weekIndex);
  if (!week) throw new TRPCError({ code: "NOT_FOUND" });

  const startDate = meso.startDate ?? now;
  const settings: ScheduleSettings = {
    mode: meso.athleteProfile.scheduleMode,
    availability: availabilityFromRows(meso.athleteProfile.availability),
    timezone: meso.athleteProfile.timezone,
  };
  const exceptions = exceptionsFromRows(meso.athleteProfile.availabilityExceptions);
  const input = scheduleInputFromDb({
    week,
    prevWeek: meso.weeks.find((w) => w.index === weekIndex - 1) ?? null,
    settings,
    startDate,
    exceptions,
    now,
  });
  return {
    mesocycleId: meso.id,
    athleteProfileId: meso.athleteProfile.id,
    lengthWeeks: meso.lengthWeeks,
    currentWeek: currentWeekIndex(meso.startDate, meso.lengthWeeks, now, settings.timezone),
    week,
    settings,
    startDate,
    exceptions,
    input,
    readOnly: weekIndex < currentWeekIndex(meso.startDate, meso.lengthWeeks, now, settings.timezone),
    days: weekDays(startDate, weekIndex, settings.timezone),
    label: (id: string) => week.sessions.find((s) => s.id === id)?.splitSlot ?? "Session",
  };
}

/** Whether the athlete dismissed the engine's suggestion for the layout the week has now.
 * A dismissal is tied to that exact layout: change it and the engine may suggest again. */
export async function suggestionDismissed(db: Pick<Tx, "decisionLog">, c: WeekContext): Promise<boolean> {
  const key = layoutKey(savedLayout(c.input));
  const dismissed = await db.decisionLog.findMany({
    where: { mesocycleId: c.mesocycleId, weekIndex: c.week.index, type: "SCHEDULE", status: "REJECTED" },
    select: { payload: true },
  });
  return dismissed.some(
    (d) => typeof d.payload === "object" && d.payload !== null && (d.payload as { layoutKey?: unknown }).layoutKey === key,
  );
}

/** Serialise writes per block. Under Read Committed two concurrent writers could both read
 * the same saved layout (or mode), both pass validation and both commit, leaving two
 * sessions on one day. Locking the block's row first makes the second writer wait, then
 * re-read (and fail its checks against) the first one's result. Returns the locked
 * mesocycle id, or null when the athlete has no ACTIVE block. */
export async function lockActiveBlock(tx: Tx, userId: string): Promise<string | null> {
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT m."id" FROM "mesocycle" m
    JOIN "athlete_profile" p ON p."id" = m."athleteProfileId"
    WHERE p."userId" = ${userId} AND m."status" = 'ACTIVE'::"BlockStatus"
    ORDER BY m."createdAt" DESC
    LIMIT 1
    FOR UPDATE OF m`;
  return locked[0]?.id ?? null;
}

export type WeekContext = Awaited<ReturnType<typeof loadWeekContext>>;
