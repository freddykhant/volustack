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
import { isValidTimeZone } from "~/domain/local-day";
import { placeWeek, type Layout } from "~/engine";
import { db } from "~/server/db";
import {
  applyLayoutToDb,
  availabilityFromRows,
  completedPlacement,
  scheduleInputFromDb,
  WEEK_FOR_SCHEDULE_INCLUDE,
  type ScheduleSettings,
} from "~/server/mesocycle/schedule-adapters";

async function main() {
  const tzOverride = process.env.BACKFILL_TZ;
  if (tzOverride && !isValidTimeZone(tzOverride)) throw new Error(`BACKFILL_TZ "${tzOverride}" is not a timezone.`);
  const now = new Date();

  const blocks = await db.mesocycle.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      startDate: true,
      athleteProfile: { select: { id: true, scheduleMode: true, timezone: true, availability: true } },
      weeks: { orderBy: { index: "asc" }, include: WEEK_FOR_SCHEDULE_INCLUDE },
    },
  });

  for (const block of blocks) {
    if (!block.startDate) {
      console.log(`block ${block.id}: no start date, skipped`);
      continue;
    }
    const startDate = block.startDate;
    let timezone = block.athleteProfile.timezone;
    if (tzOverride && timezone === "UTC") {
      await db.athleteProfile.update({ where: { id: block.athleteProfile.id }, data: { timezone: tzOverride } });
      timezone = tzOverride;
    }
    const settings: ScheduleSettings = {
      mode: block.athleteProfile.scheduleMode,
      availability: availabilityFromRows(block.athleteProfile.availability),
      timezone,
    };

    const placed = await db.$transaction(
      async (tx) => {
        let count = 0;
        let prev: (typeof block.weeks)[number] | null = null;
        for (const week of block.weeks) {
          // 1. Sessions that were actually done go where they were done.
          const done: Layout = {};
          for (const s of week.sessions) {
            if (s.dayOfWeek !== null || !s.completedAt) continue;
            const p = completedPlacement(s.completedAt, timezone, settings.mode);
            done[s.id] = p;
            s.dayOfWeek = p.day;
            s.daypart = p.daypart;
          }
          await applyLayoutToDb(tx, done);
          count += Object.keys(done).length;

          // 2. Still-scheduled, unplaced sessions are placed around everything else.
          const unplaced = week.sessions.filter((s) => s.status === "SCHEDULED" && s.dayOfWeek === null);
          if (unplaced.length > 0) {
            const input = scheduleInputFromDb({ week, prevWeek: prev, settings, startDate, now });
            const res = placeWeek({
              ...input,
              sessions: input.sessions.map((s) => (s.placement ? { ...s, locked: true } : s)),
            });
            if (res.kind === "placed") {
              const add: Layout = Object.fromEntries(unplaced.map((s) => [s.id, res.layout[s.id]!]));
              await applyLayoutToDb(tx, add);
              for (const s of unplaced) {
                s.dayOfWeek = add[s.id]!.day;
                s.daypart = add[s.id]!.daypart;
              }
              count += unplaced.length;
            } else {
              console.log(`block ${block.id} week ${week.index}: no room, left unplaced`);
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
        return count;
      },
      { timeout: 60000 },
    );
    console.log(`block ${block.id}: placed ${placed} sessions (${timezone})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void db.$disconnect());
