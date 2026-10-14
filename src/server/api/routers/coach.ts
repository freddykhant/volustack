import { Prisma } from "../../../../generated/prisma";
import { readinessState } from "~/components/viz/readiness-state";
import { resolveCoachForm } from "~/domain/coach/resolve";
import { isoDateOfDayNumber, localDayNumber } from "~/domain/local-day";
import { COACH_DAILY_LIMIT, CoachMessageInputSchema } from "~/schema";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { anthropicInterpreter, coachEnabled, type InterpretResult } from "~/server/coach/client";
import { toModelContext } from "~/server/coach/context";
import { coachWeekFrom, weekDates } from "~/server/coach/week";
import { BLOCK_FOR_READINESS_SELECT, readinessSamplesFrom } from "~/server/mesocycle/readiness-samples";
import { loadWeekContext, suggestionDismissed } from "~/server/schedule/week-context";
import { BLOCK_OVER_LINES, FINISHED_WEEK_LINES, LIMIT_LINES, UNAVAILABLE_LINES, type CoachReply, type ReadinessAnswer } from "~/views/coach";

const DAY_MS = 24 * 60 * 60 * 1000;
const asJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

export const coachRouter = createTRPCRouter({
  // Whether the coach box should be shown at all.
  status: protectedProcedure.query((): { enabled: boolean } => ({ enabled: coachEnabled() })),

  // Read a message and say what it would do. Changes no schedule state: every change
  // is made later, from a confirm card, by the schedule and session procedures.
  interpret: protectedProcedure.input(CoachMessageInputSchema).mutation(async ({ ctx, input }): Promise<CoachReply> => {
    const userId = ctx.session.user.id;
    const now = new Date();
    const c = await loadWeekContext(ctx.db, userId, input.weekIndex, now);
    if (c.readOnly) return { kind: "unsupported", lines: FINISHED_WEEK_LINES };
    // The block's last day has passed but it is still ACTIVE: no date is left to act on.
    if (weekDates(c, now).length === 0) return { kind: "unsupported", lines: BLOCK_OVER_LINES };
    if (!coachEnabled()) return { kind: "unavailable", lines: UNAVAILABLE_LINES };

    // The message's row is written before the day's rows are counted. Of two requests
    // racing for the last place, the later count sees both rows, so the cap holds without
    // a lock: at worst both are refused.
    const message = await ctx.db.coachMessage.create({
      data: { athleteProfileId: c.athleteProfileId, weekIndex: input.weekIndex, text: input.text, outcome: "pending" },
      select: { id: true },
    });
    const sent = await ctx.db.coachMessage.count({
      where: { athleteProfileId: c.athleteProfileId, createdAt: { gte: new Date(now.getTime() - DAY_MS) } },
    });
    if (sent > COACH_DAILY_LIMIT) {
      try {
        await ctx.db.coachMessage.delete({ where: { id: message.id } });
      } catch {
        // A row left behind only counts against an athlete who is already over the limit.
      }
      return { kind: "unavailable", lines: LIMIT_LINES };
    }

    // The board hides a suggestion the athlete dismissed for this layout; the coach must too.
    const dismissed = await suggestionDismissed(ctx.db, c);

    // Readiness is one of the four answers. It is best-effort: a failed read says recovery
    // is not available, and an empty series says there is not enough logged training.
    let readiness: ReadinessAnswer = null;
    try {
      const block = await ctx.db.mesocycle.findFirst({
        where: { status: "ACTIVE", athleteProfile: { userId } },
        orderBy: { createdAt: "desc" },
        select: BLOCK_FOR_READINESS_SELECT,
      });
      const samples = block ? readinessSamplesFrom(block) : [];
      const point = samples.filter((s) => s.weekIndex <= c.currentWeek).at(-1);
      if (point) readiness = { fitness: point.fitness, fatigue: point.fatigue, form: point.form, label: readinessState(point) };
    } catch {
      readiness = "unavailable";
    }

    const week = coachWeekFrom(c, { now, readiness, suggestionDismissed: dismissed });

    let result: InterpretResult;
    try {
      const today = isoDateOfDayNumber(localDayNumber(now, c.settings.timezone));
      result = await anthropicInterpreter.interpret(input.text, toModelContext(week, today));
    } catch {
      result = { ok: false, reason: "api_error" };
    }
    const reply: CoachReply = result.ok ? resolveCoachForm(result.form, week) : { kind: "unavailable", lines: UNAVAILABLE_LINES };

    // The log is for the product, not the athlete: a failed write must not turn a good reply into an error.
    try {
      await ctx.db.coachMessage.update({
        where: { id: message.id },
        data: {
          form: result.ok ? asJson(result.form) : Prisma.DbNull,
          outcome: result.ok ? reply.kind : result.reason,
          model: result.ok ? result.model : null,
          inputTokens: result.ok ? result.inputTokens : null,
          outputTokens: result.ok ? result.outputTokens : null,
        },
      });
    } catch {
      // swallowed on purpose
    }
    return reply;
  }),
});
