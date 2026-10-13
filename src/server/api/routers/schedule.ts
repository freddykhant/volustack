import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { Prisma } from "../../../../generated/prisma";
import {
  checkLayout,
  applyReplacementVerdict,
  daypartForDay,
  isCrowded,
  isStranded,
  layoutKey,
  placeWithLens,
  proposeLayouts,
  replacementQuestions,
  samePlacement,
  savedLayout,
  scoreLayout,
  suggestMoves,
  type AvailabilityCellInput,
  type HardViolationKind,
  type Layout,
} from "~/engine";
import { dayNumberOfIsoDate, localDayNumber } from "~/domain/local-day";
import {
  ApplyLayoutInputSchema,
  ExceptionInputSchema,
  SchedulePrefsInputSchema,
  TimezoneSchema,
  type ScheduleMode,
} from "~/schema";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { executeJudgement } from "~/server/judgement/execute";
import {
  applyLayoutToDb,
  availabilityFromRows,
  exceptionsFromRows,
  scheduleInputFromDb,
  weekDays,
  WEEK_FOR_SCHEDULE_INCLUDE,
  type ScheduleSettings,
} from "~/server/mesocycle/schedule-adapters";
import { currentWeekIndex } from "~/server/views/to-mesocycle-view";
import {
  DAY_NAMES,
  moveLine,
  toMoveSuggestionView,
  toReplacementOptionView,
  toScheduleWeekView,
  type MoveSuggestionView,
  type ReplacementOptionView,
  type ScheduleWeekView,
} from "~/views/schedule";

type Tx = Prisma.TransactionClient;
type SkipReason = "already_started" | "different_sessions" | "not_allowed";

/** Plain-data payloads (layouts, facts) are valid JSON; Prisma's input type just can't see that. */
const asJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

const WeekInput = z.object({ weekIndex: z.number().int().min(1) });

/** The dayparts an exception covers. Null means the whole day. */
const daypartsOf = (daypart: "AM" | "PM" | null): ("AM" | "PM")[] => (daypart === null ? ["AM", "PM"] : [daypart]);
/** A calendar date as Prisma wants a `@db.Date`. */
const dbDate = (iso: string) => new Date(`${iso}T00:00:00Z`);

const VIOLATION_MESSAGE: Record<HardViolationKind, string> = {
  blocked_cell: "That time is blocked in your availability.",
  occupied: "Two sessions can't share the same time.",
  day_limit: "You're set to one session a day.",
  in_past: "That day has already passed.",
  locked: "A completed or missed session can't be moved.",
  mode_mismatch: "That placement doesn't match your schedule mode.",
  unknown_session: "That session isn't in this week.",
};

/** Everything about one week of the signed-in athlete's ACTIVE block that scheduling
 * needs. Throws NOT_FOUND when the block or the week isn't theirs. */
async function loadWeekContext(db: Pick<Tx, "mesocycle">, userId: string, weekIndex: number, now: Date) {
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

/** Serialise writes per block. Under Read Committed two concurrent writers could both read
 * the same saved layout (or mode), both pass validation and both commit, leaving two
 * sessions on one day. Locking the block's row first makes the second writer wait, then
 * re-read (and fail its checks against) the first one's result. Returns the locked
 * mesocycle id, or null when the athlete has no ACTIVE block. */
async function lockActiveBlock(tx: Tx, userId: string): Promise<string | null> {
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT m."id" FROM "mesocycle" m
    JOIN "athlete_profile" p ON p."id" = m."athleteProfileId"
    WHERE p."userId" = ${userId} AND m."status" = 'ACTIVE'::"BlockStatus"
    ORDER BY m."createdAt" DESC
    LIMIT 1
    FOR UPDATE OF m`;
  return locked[0]?.id ?? null;
}

export const scheduleRouter = createTRPCRouter({
  // Read: the week's layout plus the engine input, so the browser can score drafts.
  getWeekSchedule: protectedProcedure.input(WeekInput).query(async ({ ctx, input }): Promise<ScheduleWeekView> => {
    const c = await loadWeekContext(ctx.db, ctx.session.user.id, input.weekIndex, new Date());
    return toScheduleWeekView({
      weekIndex: input.weekIndex,
      readOnly: c.readOnly,
      mode: c.settings.mode,
      timezone: c.settings.timezone,
      days: c.days,
      sessions: [...c.week.sessions]
        .sort((a, b) => a.order - b.order)
        .map((s) => ({ id: s.id, label: s.splitSlot, estimatedMinutes: s.targetDurationMin ?? 0, status: s.status })),
      input: c.input,
    });
  }),

  // Read: the engine's best single tweaks to the saved layout. Mutates nothing.
  getSuggestions: protectedProcedure.input(WeekInput).query(async ({ ctx, input }): Promise<MoveSuggestionView[]> => {
    const c = await loadWeekContext(ctx.db, ctx.session.user.id, input.weekIndex, new Date());
    if (c.readOnly) return [];
    // A stranded session is the replacement panel's job; one voice at a time.
    if (isStranded(c.input)) return [];
    const layout = savedLayout(c.input);
    const key = layoutKey(layout);
    const dismissed = await ctx.db.decisionLog.findMany({
      where: { mesocycleId: c.mesocycleId, weekIndex: input.weekIndex, type: "SCHEDULE", status: "REJECTED" },
      select: { payload: true },
    });
    const wasDismissed = dismissed.some(
      (d) => typeof d.payload === "object" && d.payload !== null && (d.payload as { layoutKey?: unknown }).layoutKey === key,
    );
    if (wasDismissed) return [];
    return suggestMoves(c.input, layout).map((s) => toMoveSuggestionView(s, c.label));
  }),

  // The placement write for everything the athlete chooses (the one other placement write
  // is the quiet re-placement of a later week in `setException`). An athlete's own move is
  // recorded, not gated; a suggestion only arrives here because the athlete pressed Accept.
  applyLayout: protectedProcedure.input(ApplyLayoutInputSchema).mutation(
    async ({ ctx, input }): Promise<{ weekIndex: number; applied: number[]; skipped: { weekIndex: number; reason: SkipReason }[] }> => {
      const userId = ctx.session.user.id;
      const now = new Date();
      return ctx.db.$transaction(
        async (tx) => {
          if ((await lockActiveBlock(tx, userId)) === null) throw new TRPCError({ code: "NOT_FOUND" });

          const c = await loadWeekContext(tx, userId, input.weekIndex, now);
          if (c.readOnly) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "That week has already finished." });
          }
          const saved = savedLayout(c.input);
          const ids = new Set(c.input.sessions.map((s) => s.id));

          // Optimistic concurrency: the client must have started from what is saved now.
          const stale =
            input.expected.length !== ids.size ||
            new Set(input.expected.map((e) => e.sessionId)).size !== ids.size ||
            input.expected.some((e) => !ids.has(e.sessionId) || !samePlacement(saved[e.sessionId] ?? null, e.placement));
          if (stale) {
            throw new TRPCError({ code: "CONFLICT", message: "This week changed somewhere else. We've reloaded it." });
          }

          const proposed: Layout = { ...saved };
          for (const p of input.placements) {
            if (!ids.has(p.sessionId)) {
              throw new TRPCError({ code: "BAD_REQUEST", message: VIOLATION_MESSAGE.unknown_session });
            }
            proposed[p.sessionId] = { day: p.day, daypart: p.daypart };
          }

          const movedIds = [...ids].filter((id) => !samePlacement(saved[id] ?? null, proposed[id] ?? null));

          // A session completed or missed since the client loaded the week is a conflict
          // (the board is stale), not a bad request.
          const lockedIds = new Set(c.input.sessions.filter((s) => s.locked).map((s) => s.id));
          if (movedIds.some((id) => lockedIds.has(id))) {
            throw new TRPCError({ code: "CONFLICT", message: "A session changed while you were moving it. Please try again." });
          }

          const violations = checkLayout(c.input, proposed);
          if (violations.length > 0) {
            const lines = new Set(
              violations.map((v) =>
                v.kind === "unknown_session"
                  ? VIOLATION_MESSAGE.unknown_session
                  : `${c.label(v.sessionId)}: ${VIOLATION_MESSAGE[v.kind]}`,
              ),
            );
            throw new TRPCError({ code: "BAD_REQUEST", message: [...lines].join(" ") });
          }

          if (movedIds.length === 0) return { weekIndex: input.weekIndex, applied: [], skipped: [] };

          // The write itself is conditional on status, so a session logged in the meantime
          // is never moved; fewer rows written than moved rolls the whole transaction back.
          const written = await applyLayoutToDb(
            tx,
            Object.fromEntries(movedIds.map((id) => [id, proposed[id]!])),
            { onlyScheduled: true },
          );
          if (written !== movedIds.length) {
            throw new TRPCError({ code: "CONFLICT", message: "A session changed while you were moving it. Please try again." });
          }

          await tx.decisionLog.create({
            data: {
              mesocycleId: c.mesocycleId,
              weekIndex: input.weekIndex,
              type: "SCHEDULE",
              status: "APPLIED",
              summary:
                input.origin === "suggestion"
                  ? "Accepted a suggested move"
                  : input.origin === "replacement"
                    ? "Week re-arranged around blocked time"
                    : "Sessions moved",
              reasoning: input.origin,
              payload: asJson({
                origin: input.origin,
                ...(input.optionId !== undefined ? { optionId: input.optionId } : {}),
                before: saved,
                after: proposed,
                facts: scoreLayout(c.input, proposed).facts,
              }),
            },
          });

          const applied: number[] = [];
          const skipped: { weekIndex: number; reason: SkipReason }[] = [];
          if (input.carryForward) {
            const byOrder = new Map(c.week.sessions.map((s) => [s.order, proposed[s.id]]));
            const later = await tx.week.findMany({
              where: { mesocycleId: c.mesocycleId, index: { gt: input.weekIndex } },
              orderBy: { index: "asc" },
              include: WEEK_FOR_SCHEDULE_INCLUDE,
            });
            for (const w of later) {
              if (w.sessions.some((s) => s.status !== "SCHEDULED")) {
                skipped.push({ weekIndex: w.index, reason: "already_started" });
                continue;
              }
              if (w.sessions.length !== c.week.sessions.length || w.sessions.some((s) => !byOrder.get(s.order))) {
                skipped.push({ weekIndex: w.index, reason: "different_sessions" });
                continue;
              }
              const wInput = scheduleInputFromDb({ week: w, prevWeek: null, settings: c.settings, startDate: c.startDate, exceptions: c.exceptions, now });
              const target: Layout = Object.fromEntries(w.sessions.map((s) => [s.id, byOrder.get(s.order)!]));
              if (checkLayout(wInput, target).length > 0) {
                skipped.push({ weekIndex: w.index, reason: "not_allowed" });
                continue;
              }
              const before = savedLayout(wInput);
              const changed = Object.fromEntries(
                Object.entries(target).filter(([id, p]) => !samePlacement(before[id] ?? null, p)),
              );
              await applyLayoutToDb(tx, changed, { onlyScheduled: true });
              await tx.decisionLog.create({
                data: {
                  mesocycleId: c.mesocycleId,
                  weekIndex: w.index,
                  type: "SCHEDULE",
                  status: "APPLIED",
                  summary: `Layout carried forward from week ${input.weekIndex}`,
                  reasoning: "carry_forward",
                  payload: asJson({ origin: "carry_forward", before, after: target, facts: scoreLayout(wInput, target).facts }),
                },
              });
              applied.push(w.index);
            }
          }
          return { weekIndex: input.weekIndex, applied, skipped };
        },
        { timeout: 15000 },
      );
    },
  ),

  // One-off blocked time. On the current week this only records the fact: the board
  // then offers options. A later week has not been trained, so it is re-placed quietly.
  setException: protectedProcedure
    .input(ExceptionInputSchema)
    .mutation(async ({ ctx, input }): Promise<{ weekIndex: number; moved: string[]; needsChoice: boolean }> => {
      const userId = ctx.session.user.id;
      const now = new Date();
      return ctx.db.$transaction(
        async (tx) => {
          if ((await lockActiveBlock(tx, userId)) === null) throw new TRPCError({ code: "NOT_FOUND" });

          // Week 1 always exists; it gives us the block's dates and the athlete's settings.
          const block = await loadWeekContext(tx, userId, 1, now);
          const tz = block.settings.timezone;
          const day = dayNumberOfIsoDate(input.date);
          const start = localDayNumber(block.startDate, tz);
          if (day < start || day >= start + block.lengthWeeks * 7) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "That date is outside your current block." });
          }
          if (day < localDayNumber(now, tz)) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "That day has already passed." });
          }
          if (block.settings.mode === "DAY" && input.daypart !== null) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "You're set to one session a day, so block the whole day." });
          }

          await tx.availabilityException.createMany({
            data: daypartsOf(input.daypart).map((daypart) => ({
              athleteProfileId: block.athleteProfileId,
              date: dbDate(input.date),
              daypart,
            })),
            skipDuplicates: true,
          });

          const weekIndex = Math.floor((day - start) / 7) + 1;
          if (weekIndex <= block.currentWeek) return { weekIndex, moved: [], needsChoice: false };

          const c = await loadWeekContext(tx, userId, weekIndex, now);
          if (!isStranded(c.input)) return { weekIndex, moved: [], needsChoice: false };
          if (isCrowded(c.input)) return { weekIndex, moved: [], needsChoice: true };
          const res = placeWithLens(c.input, "FEWEST_CHANGES");
          if (res.kind !== "placed") return { weekIndex, moved: [], needsChoice: true };
          // Nothing is written unless the layout passes every hard rule.
          if (checkLayout(c.input, res.layout).length > 0) return { weekIndex, moved: [], needsChoice: true };

          const before = savedLayout(c.input);
          const changed = Object.fromEntries(
            Object.entries(res.layout).filter(([id, p]) => !samePlacement(before[id] ?? null, p)),
          );
          const written = await applyLayoutToDb(tx, changed, { onlyScheduled: true });
          if (written !== Object.keys(changed).length) {
            throw new TRPCError({ code: "CONFLICT", message: "A session changed while we were re-arranging that week. Please try again." });
          }
          await tx.decisionLog.create({
            data: {
              mesocycleId: c.mesocycleId,
              weekIndex,
              type: "SCHEDULE",
              status: "APPLIED",
              summary: "Week re-arranged around blocked time",
              reasoning: "exception",
              payload: asJson({
                origin: "exception",
                lens: "FEWEST_CHANGES",
                before,
                after: res.layout,
                facts: scoreLayout(c.input, res.layout).facts,
              }),
            },
          });
          return {
            weekIndex,
            moved: Object.entries(changed).map(([sessionId, to]) =>
              moveLine({ sessionId, from: before[sessionId] ?? null, to }, c.label),
            ),
            needsChoice: false,
          };
        },
        { timeout: 15000 },
      );
    }),

  // Unblocking never moves a session back; the athlete or a suggestion can.
  clearException: protectedProcedure.input(ExceptionInputSchema).mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
    const userId = ctx.session.user.id;
    await ctx.db.$transaction(
      async (tx) => {
        if ((await lockActiveBlock(tx, userId)) === null) throw new TRPCError({ code: "NOT_FOUND" });
        const block = await loadWeekContext(tx, userId, 1, new Date());
        await tx.availabilityException.deleteMany({
          where: {
            athleteProfileId: block.athleteProfileId,
            date: dbDate(input.date),
            daypart: { in: block.settings.mode === "DAY" ? ["AM", "PM"] : daypartsOf(input.daypart) },
          },
        });
      },
      { timeout: 15000 },
    );
    return { ok: true };
  }),

  // Read: ways to re-arrange a week in which a session is standing on blocked time.
  // Changes no schedule state (a judgement cache row may be written). The engine's order
  // stands unless a confident verdict says otherwise;
  // the judgement is best-effort, so any failure degrades to the engine's order.
  getReplacementOptions: protectedProcedure
    .input(WeekInput)
    .query(async ({ ctx, input }): Promise<ReplacementOptionView[]> => {
      const c = await loadWeekContext(ctx.db, ctx.session.user.id, input.weekIndex, new Date());
      if (c.readOnly || !isStranded(c.input)) return [];
      const options = proposeLayouts(c.input);
      if (options.length === 0) return [];

      let ordered = { options, judged: false };
      if (options.length > 1) {
        try {
          const verdicts = await executeJudgement({
            db: ctx.db,
            mesocycleId: c.mesocycleId,
            request: replacementQuestions(options, c.input, c.label),
            fallback: { lead: options[0]!.id },
          });
          ordered = applyReplacementVerdict(options, verdicts);
        } catch {
          ordered = { options, judged: false };
        }
      }
      return ordered.options.map((o, i) => toReplacementOptionView(o, c.label, { lead: i === 0, judged: ordered.judged }));
    }),

  getPrefs: protectedProcedure.query(
    async ({ ctx }): Promise<{ scheduleMode: ScheduleMode; timezone: string; availability: AvailabilityCellInput[] }> => {
      const profile = await ctx.db.athleteProfile.findUnique({
        where: { userId: ctx.session.user.id },
        select: { scheduleMode: true, timezone: true, availability: true },
      });
      if (!profile) return { scheduleMode: "DAY", timezone: "UTC", availability: [] };
      return {
        scheduleMode: profile.scheduleMode,
        timezone: profile.timezone,
        availability: availabilityFromRows(profile.availability),
      };
    },
  ),

  // Preferences never move a session's day. A mode switch only adds or clears dayparts,
  // and is refused when it would leave two sessions on one day in one-a-day mode.
  updatePrefs: protectedProcedure
    .input(SchedulePrefsInputSchema)
    .mutation(async ({ ctx, input }): Promise<{ scheduleMode: ScheduleMode }> => {
      const userId = ctx.session.user.id;
      const now = new Date();
      await ctx.db.$transaction(
        async (tx) => {
          // Serialise against applyLayout and other preference writes on this block.
          const mesocycleId = await lockActiveBlock(tx, userId);

          const profile = await tx.athleteProfile.findUnique({
            where: { userId },
            select: { id: true, scheduleMode: true, timezone: true },
          });
          if (!profile) throw new TRPCError({ code: "NOT_FOUND" });

          // With no ACTIVE block there are no sessions to consider.
          if (mesocycleId !== null && profile.scheduleMode !== input.scheduleMode) {
            const meso = await tx.mesocycle.findUnique({
              where: { id: mesocycleId },
              select: { startDate: true, lengthWeeks: true },
            });
            if (!meso) throw new TRPCError({ code: "NOT_FOUND" });
            const currentWeek = currentWeekIndex(meso.startDate, meso.lengthWeeks, now, profile.timezone);
            const scheduled = {
              status: "SCHEDULED" as const,
              dayOfWeek: { not: null },
              week: { mesocycle: { status: "ACTIVE" as const, athleteProfileId: profile.id } },
            };
            const sessions = await tx.trainingSession.findMany({
              where: scheduled,
              select: { id: true, weekId: true, dayOfWeek: true, week: { select: { index: true } } },
            });
            if (input.scheduleMode === "DAY") {
              const seen = new Map<string, number>();
              const clashes: string[] = [];
              // Finished weeks are read-only, so a clash left in one must not block the switch.
              for (const s of sessions) {
                if (s.week.index < currentWeek) continue;
                const key = `${s.weekId}:${s.dayOfWeek}`;
                const n = (seen.get(key) ?? 0) + 1;
                seen.set(key, n);
                if (n === 2) clashes.push(`${DAY_NAMES[s.dayOfWeek ?? 0]} in week ${s.week.index}`);
              }
              if (clashes.length > 0) {
                throw new TRPCError({
                  code: "BAD_REQUEST",
                  message: `Two sessions share ${clashes.join(", ")}. Move one of each pair to another day, then switch to one session a day.`,
                });
              }
              await tx.trainingSession.updateMany({ where: scheduled, data: { daypart: null } });
            } else {
              for (const s of sessions) {
                await tx.trainingSession.update({
                  where: { id: s.id },
                  data: { daypart: daypartForDay(input.availability, s.dayOfWeek ?? 0) },
                });
              }
            }
          }

          // One-a-day has no half-days, so a half-day exception becomes the whole day.
          // Exceptions belong to the profile, so this runs with or without an ACTIVE block.
          if (profile.scheduleMode !== input.scheduleMode && input.scheduleMode === "DAY") {
            const exceptionRows = await tx.availabilityException.findMany({
              where: { athleteProfileId: profile.id },
              select: { date: true },
            });
            const dates = [...new Map(exceptionRows.map((e) => [e.date.toISOString(), e.date])).values()];
            if (dates.length > 0) {
              await tx.availabilityException.createMany({
                data: dates.flatMap((date) =>
                  (["AM", "PM"] as const).map((daypart) => ({ athleteProfileId: profile.id, date, daypart })),
                ),
                skipDuplicates: true,
              });
            }
          }

          await tx.availabilityCell.deleteMany({ where: { athleteProfileId: profile.id } });
          if (input.availability.length > 0) {
            await tx.availabilityCell.createMany({
              data: input.availability.map((c) => ({
                athleteProfileId: profile.id,
                dayOfWeek: c.day,
                daypart: c.daypart,
                state: c.state,
              })),
            });
          }
          await tx.athleteProfile.update({ where: { id: profile.id }, data: { scheduleMode: input.scheduleMode } });
        },
        { timeout: 15000 },
      );
      return { scheduleMode: input.scheduleMode };
    }),

  setTimezone: protectedProcedure
    .input(z.object({ timezone: TimezoneSchema }))
    .mutation(async ({ ctx, input }): Promise<{ timezone: string }> => {
      await ctx.db.athleteProfile.updateMany({
        where: { userId: ctx.session.user.id },
        data: { timezone: input.timezone },
      });
      return { timezone: input.timezone };
    }),

  // Remember that the athlete declined the suggestion for this exact layout.
  dismissSuggestion: protectedProcedure.input(WeekInput).mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
    const c = await loadWeekContext(ctx.db, ctx.session.user.id, input.weekIndex, new Date());
    await ctx.db.decisionLog.create({
      data: {
        mesocycleId: c.mesocycleId,
        weekIndex: input.weekIndex,
        type: "SCHEDULE",
        status: "REJECTED",
        summary: "Suggested move dismissed",
        reasoning: "dismissed",
        payload: { layoutKey: layoutKey(savedLayout(c.input)) },
        respondedAt: new Date(),
      },
    });
    return { ok: true };
  }),
});
