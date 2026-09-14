import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { DEFAULT_LANDMARKS } from "~/domain/landmarks";
import { redistributeWeek, type AthleteContext, type WeekPlan } from "~/engine";
import { LogSessionInputSchema } from "~/schema";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { applyWeekPlanToDb } from "~/server/mesocycle/apply-week-plan";
import {
  adaptationContextFrom,
  weekPlanFromDb,
  CS_WITH_TARGETS_INCLUDE,
  WEEK_FOR_PLAN_INCLUDE,
} from "~/server/mesocycle/reschedule-adapters";
import type { db as dbClient } from "~/server/db";
import { toRescheduleOptionViews } from "~/views/reschedule";

type Db = typeof dbClient;

const RescheduleKindEnum = z.enum(["MAKE_UP", "PARTIAL", "LET_GO"]);

/** Load a SCHEDULED-eligible session scoped to the signed-in athlete's ACTIVE block,
 * plus everything the reschedule path needs. Throws NOT_FOUND if it isn't theirs. */
async function loadRescheduleContext(
  db: Db,
  userId: string,
  sessionId: string,
) {
  const session = await db.trainingSession.findFirst({
    where: {
      id: sessionId,
      week: { mesocycle: { status: "ACTIVE", athleteProfile: { userId } } },
    },
    select: {
      id: true,
      status: true,
      week: {
        select: {
          id: true,
          index: true,
          mesocycleId: true,
          mesocycle: {
            select: {
              constraintSetId: true,
              athleteProfile: { select: { experience: true, phase: true } },
            },
          },
        },
      },
    },
  });
  if (!session) throw new TRPCError({ code: "NOT_FOUND" });
  return session;
}

export const sessionRouter = createTRPCRouter({
  // Record truth — no accept-gate.
  logSession: protectedProcedure
    .input(LogSessionInputSchema)
    .mutation(async ({ ctx, input }): Promise<{ status: "COMPLETED" }> => {
      const userId = ctx.session.user.id;
      const session = await ctx.db.trainingSession.findFirst({
        where: { id: input.sessionId, week: { mesocycle: { status: "ACTIVE", athleteProfile: { userId } } } },
        select: { id: true, status: true, prescriptions: { select: { id: true } } },
      });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      if (session.status === "MISSED") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This session was marked missed — reschedule it instead of logging." });
      }
      const validIds = new Set(session.prescriptions.map((p) => p.id));
      for (const s of input.sets) {
        if (!validIds.has(s.prescriptionId)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "A logged set references an exercise not in this session." });
        }
      }
      await ctx.db.$transaction(
        async (tx) => {
          await tx.setLog.deleteMany({ where: { exercisePrescriptionId: { in: [...validIds] } } });
          if (input.sets.length > 0) {
            await tx.setLog.createMany({
              data: input.sets.map((s) => ({
                exercisePrescriptionId: s.prescriptionId,
                setNumber: s.setNumber,
                weightKg: s.weightKg,
                reps: s.reps,
                achievedRir: s.achievedRir ?? null,
              })),
            });
          }
          await tx.trainingSession.update({
            where: { id: session.id },
            data: { status: "COMPLETED", completedAt: new Date() },
          });
        },
        { timeout: 15000 },
      );
      return { status: "COMPLETED" };
    }),

  // Compute reschedule proposals — mutates nothing.
  getRescheduleOptions: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const session = await loadRescheduleContext(ctx.db, userId, input.sessionId);
      if (session.status !== "SCHEDULED") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only a scheduled session can be rescheduled." });
      }
      const { forRedistribute, candidates } = await computeCandidates(ctx.db, session);
      return toRescheduleOptionViews(candidates, forRedistribute);
    }),

  // Accept-gated plan mutation.
  applyReschedule: protectedProcedure
    .input(z.object({ sessionId: z.string(), kind: RescheduleKindEnum }))
    .mutation(async ({ ctx, input }): Promise<{ weekIndex: number }> => {
      const userId = ctx.session.user.id;
      const session = await loadRescheduleContext(ctx.db, userId, input.sessionId);
      if (session.status !== "SCHEDULED") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only a scheduled session can be rescheduled." });
      }
      const { candidates } = await computeCandidates(ctx.db, session);
      const chosen = candidates.find((c) => c.kind === input.kind);
      if (!chosen) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "That reschedule option isn't available." });
      }
      const weekIndex = session.week.index;
      await ctx.db.$transaction(
        async (tx) => {
          await tx.trainingSession.update({ where: { id: session.id }, data: { status: "MISSED" } });
          if (chosen.kind !== "LET_GO") {
            await applyWeekPlanToDb(tx, session.week.id, chosen.week);
          }
          await tx.decisionLog.create({
            data: {
              mesocycleId: session.week.mesocycleId,
              weekIndex,
              type: "REDISTRIBUTE",
              status: "APPLIED",
              summary: `Missed session rescheduled (${chosen.kind})`,
              reasoning: chosen.kind,
              payload: { kind: chosen.kind, tradeoff: { ...chosen.tradeoff }, facts: chosen.facts },
            },
          });
        },
        { timeout: 15000 },
      );
      return { weekIndex };
    }),
});

/** Shared: rebuild the week plan (excluding already-COMPLETED sessions so their logs
 * are never touched), build the adaptation context, and run redistributeWeek. */
async function computeCandidates(
  db: Db,
  session: Awaited<ReturnType<typeof loadRescheduleContext>>,
) {
  const week = await db.week.findUniqueOrThrow({
    where: { id: session.week.id },
    include: WEEK_FOR_PLAN_INCLUDE,
  });
  const cs = await db.constraintSet.findUniqueOrThrow({
    where: { id: session.week.mesocycle.constraintSetId },
    include: CS_WITH_TARGETS_INCLUDE,
  });
  const athlete: AthleteContext = {
    experienceLevel: session.week.mesocycle.athleteProfile.experience,
    phase: session.week.mesocycle.athleteProfile.phase,
    landmarks: DEFAULT_LANDMARKS,
  };
  const completed = new Set(week.sessions.filter((s) => s.status === "COMPLETED").map((s) => s.id));
  const fullPlan = weekPlanFromDb(week);
  // Exclude completed sessions from redistribution targets (protects their SetLogs).
  const forRedistribute: WeekPlan = { ...fullPlan, sessions: fullPlan.sessions.filter((s) => !completed.has(s.slotId)) };
  const ctxA = adaptationContextFrom(cs, athlete);
  const candidates = redistributeWeek(forRedistribute, [session.id], ctxA);
  return { forRedistribute, candidates };
}
