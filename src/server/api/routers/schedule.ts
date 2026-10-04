import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { Prisma } from "../../../../generated/prisma";
import {
  checkLayout,
  layoutKey,
  samePlacement,
  savedLayout,
  scoreLayout,
  suggestMoves,
  type HardViolationKind,
  type Layout,
} from "~/engine";
import { ApplyLayoutInputSchema } from "~/schema";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  applyLayoutToDb,
  availabilityFromRows,
  scheduleInputFromDb,
  weekDays,
  WEEK_FOR_SCHEDULE_INCLUDE,
  type ScheduleSettings,
} from "~/server/mesocycle/schedule-adapters";
import { currentWeekIndex } from "~/server/views/to-mesocycle-view";
import {
  toMoveSuggestionView,
  toScheduleWeekView,
  type MoveSuggestionView,
  type ScheduleWeekView,
} from "~/views/schedule";

type Tx = Prisma.TransactionClient;
type SkipReason = "already_started" | "different_sessions" | "not_allowed";

/** Plain-data payloads (layouts, facts) are valid JSON; Prisma's input type just can't see that. */
const asJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

const WeekInput = z.object({ weekIndex: z.number().int().min(1) });

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
      athleteProfile: { select: { scheduleMode: true, timezone: true, availability: true } },
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
  const input = scheduleInputFromDb({
    week,
    prevWeek: meso.weeks.find((w) => w.index === weekIndex - 1) ?? null,
    settings,
    startDate,
    now,
  });
  return {
    mesocycleId: meso.id,
    week,
    settings,
    startDate,
    input,
    readOnly: weekIndex < currentWeekIndex(meso.startDate, meso.lengthWeeks, now),
    days: weekDays(startDate, weekIndex, settings.timezone),
    label: (id: string) => week.sessions.find((s) => s.id === id)?.splitSlot ?? "Session",
  };
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

  // The only placement write. An athlete's own move is recorded, not gated; a
  // suggestion only arrives here because the athlete pressed Accept.
  applyLayout: protectedProcedure.input(ApplyLayoutInputSchema).mutation(
    async ({ ctx, input }): Promise<{ weekIndex: number; applied: number[]; skipped: { weekIndex: number; reason: SkipReason }[] }> => {
      const userId = ctx.session.user.id;
      const now = new Date();
      return ctx.db.$transaction(
        async (tx) => {
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

          const violations = checkLayout(c.input, proposed);
          if (violations.length > 0) {
            throw new TRPCError({ code: "BAD_REQUEST", message: VIOLATION_MESSAGE[violations[0]!.kind] });
          }

          const movedIds = [...ids].filter((id) => !samePlacement(saved[id] ?? null, proposed[id] ?? null));
          if (movedIds.length === 0) return { weekIndex: input.weekIndex, applied: [], skipped: [] };

          // Statuses were read a moment ago; a session logged concurrently must not be moved.
          const stillScheduled = await tx.trainingSession.count({
            where: { id: { in: movedIds }, status: "SCHEDULED" },
          });
          if (stillScheduled !== movedIds.length) {
            throw new TRPCError({ code: "CONFLICT", message: "A session changed while you were moving it. Please try again." });
          }

          await applyLayoutToDb(tx, Object.fromEntries(movedIds.map((id) => [id, proposed[id]!])));
          await tx.decisionLog.create({
            data: {
              mesocycleId: c.mesocycleId,
              weekIndex: input.weekIndex,
              type: "SCHEDULE",
              status: "APPLIED",
              summary: input.origin === "suggestion" ? "Accepted a suggested move" : "Sessions moved",
              reasoning: input.origin,
              payload: asJson({ origin: input.origin, before: saved, after: proposed, facts: scoreLayout(c.input, proposed).facts }),
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
              const wInput = scheduleInputFromDb({ week: w, prevWeek: null, settings: c.settings, startDate: c.startDate, now });
              const target: Layout = Object.fromEntries(w.sessions.map((s) => [s.id, byOrder.get(s.order)!]));
              if (checkLayout(wInput, target).length > 0) {
                skipped.push({ weekIndex: w.index, reason: "not_allowed" });
                continue;
              }
              const before = savedLayout(wInput);
              const changed = Object.fromEntries(
                Object.entries(target).filter(([id, p]) => !samePlacement(before[id] ?? null, p)),
              );
              await applyLayoutToDb(tx, changed);
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
