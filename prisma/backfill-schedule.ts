/**
 * One-off: give every unplaced session in ACTIVE blocks a placement.
 *
 *   pnpm db:backfill-schedule                                  # keep each profile's timezone
 *   BACKFILL_TZ=Australia/Sydney pnpm db:backfill-schedule     # also set it where still "UTC"
 *
 * Completed sessions go on the weekday they were actually done. Scheduled sessions in
 * current and future weeks are placed by the engine around whatever is already placed.
 * Safe to re-run: a session that already has a day is never moved.
 */
import {
  isoDateOfDayNumber,
  isValidTimeZone,
  localDayNumber,
} from "~/domain/local-day";
import { placeWeek, type Layout } from "~/engine";
import { db } from "~/server/db";
import {
  applyLayoutToDb,
  availabilityFromRows,
  completedPlacement,
  scheduleInputFromDb,
  weekDays,
  WEEK_FOR_SCHEDULE_INCLUDE,
  type ScheduleSettings,
  type WeekForSchedule,
} from "~/server/mesocycle/schedule-adapters";

async function main() {
  const tzOverride = process.env.BACKFILL_TZ;
  if (tzOverride && !isValidTimeZone(tzOverride))
    throw new Error(`BACKFILL_TZ "${tzOverride}" is not a timezone.`);
  const now = new Date();

  // Only the list of blocks is read here. Everything that gets written is read again under a lock.
  const blocks = await db.mesocycle.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, startDate: true, athleteProfileId: true },
  });

  for (const block of blocks) {
    if (!block.startDate) {
      console.log(`block ${block.id}: no start date, skipped`);
      continue;
    }
    const startDate = block.startDate;

    const result = await db.$transaction(
      async (tx) => {
        // The lock serialises this backfill against the app's placement writes (applyLayout, updatePrefs).
        await tx.$queryRaw`SELECT m."id" FROM "mesocycle" m WHERE m."id" = ${block.id} FOR UPDATE`;

        const profile = await tx.athleteProfile.findUniqueOrThrow({
          where: { id: block.athleteProfileId },
          select: {
            id: true,
            scheduleMode: true,
            timezone: true,
            availability: true,
          },
        });
        let timezone = profile.timezone;
        if (tzOverride && timezone === "UTC") {
          await tx.athleteProfile.update({
            where: { id: profile.id },
            data: { timezone: tzOverride },
          });
          timezone = tzOverride;
        }
        if (timezone === "UTC") {
          console.warn(
            `block ${block.id}: WARNING timezone is still "UTC", so completion days may be off by one. Set BACKFILL_TZ to the athlete's timezone.`,
          );
        }
        const settings: ScheduleSettings = {
          mode: profile.scheduleMode,
          availability: availabilityFromRows(profile.availability),
          timezone,
        };

        const weeks = await tx.week.findMany({
          where: { mesocycleId: block.id },
          orderBy: { index: "asc" },
          include: WEEK_FOR_SCHEDULE_INCLUDE,
        });

        let count = 0;
        let prev: WeekForSchedule | null = null;
        for (const week of weeks) {
          // 1. Sessions that were actually done go where they were done, if that is inside this week.
          const dates = weekDays(startDate, week.index, timezone).map(
            (d) => d.date,
          );
          const cellOf = (day: number, daypart: string | null) =>
            settings.mode === "DAY" ? `${day}` : `${day}:${daypart}`;
          const doneCells = new Set(
            week.sessions
              .filter((s) => s.dayOfWeek !== null && s.status === "COMPLETED")
              .map((s) => cellOf(s.dayOfWeek!, s.daypart)),
          );
          const done: Layout = {};
          for (const s of week.sessions) {
            if (s.dayOfWeek !== null || !s.completedAt) continue;
            const doneOn = isoDateOfDayNumber(
              localDayNumber(s.completedAt, timezone),
            );
            if (!dates.includes(doneOn)) {
              console.log(
                `block ${block.id} week ${week.index}: "${s.splitSlot}" was completed on ${doneOn}, outside the week, left unplaced`,
              );
              continue;
            }
            const p = completedPlacement(
              s.completedAt,
              timezone,
              settings.mode,
            );
            const cell = cellOf(p.day, p.daypart);
            if (doneCells.has(cell)) {
              console.log(
                `block ${block.id} week ${week.index}: more than one completed session on day ${p.day}, kept as done`,
              );
            }
            doneCells.add(cell);
            done[s.id] = p;
            s.dayOfWeek = p.day;
            s.daypart = p.daypart;
          }
          await applyLayoutToDb(tx, done);
          count += Object.keys(done).length;

          // 2. Still-scheduled, unplaced sessions are placed around everything else.
          const unplaced = week.sessions.filter(
            (s) => s.status === "SCHEDULED" && s.dayOfWeek === null,
          );
          if (unplaced.length > 0) {
            const input = scheduleInputFromDb({
              week,
              prevWeek: prev,
              settings,
              startDate,
              now,
            });
            const res = placeWeek({
              ...input,
              sessions: input.sessions.map((s) =>
                s.placement ? { ...s, locked: true } : s,
              ),
            });
            if (res.kind === "placed") {
              const add: Layout = Object.fromEntries(
                unplaced.map((s) => [s.id, res.layout[s.id]!]),
              );
              await applyLayoutToDb(tx, add);
              for (const s of unplaced) {
                s.dayOfWeek = add[s.id]!.day;
                s.daypart = add[s.id]!.daypart;
              }
              count += unplaced.length;
            } else {
              console.log(
                `block ${block.id} week ${week.index}: no room, left unplaced`,
              );
            }
          }
          prev = week;
        }
        if (count > 0) {
          await tx.decisionLog.create({
            data: {
              mesocycleId: block.id,
              type: "SCHEDULE",
              status: "APPLIED",
              summary: `Placed ${count} sessions`,
              reasoning: "backfill",
              payload: { origin: "auto", placed: count },
            },
          });
        }
        return { count, timezone };
      },
      { timeout: 60000 },
    );
    console.log(
      `block ${block.id}: placed ${result.count} sessions (${result.timezone})`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void db.$disconnect());
