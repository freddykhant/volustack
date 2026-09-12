import { TRPCError } from "@trpc/server";
import { EXERCISE_LIBRARY } from "~/domain/exercise-library";
import { DEFAULT_LANDMARKS } from "~/domain/landmarks";
import { buildConstraintSetInput } from "~/domain/onboarding-template";
import {
  generateMesocycle,
  resolveConstraints,
  type AthleteContext,
  type InfeasibilityReport,
} from "~/engine";
import { OnboardingInputSchema } from "~/schema";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { persistMesocyclePlan } from "~/server/mesocycle/persist";

/** Turn an engine infeasibility report into an athlete-facing sentence. */
function infeasibilityMessage(report: InfeasibilityReport): string {
  const fact = report.facts.find((f) => f.kind === "infeasible");
  if (fact?.kind === "infeasible") {
    if (fact.constraint === "session_time") {
      return "Your split doesn't fit that much training into the session length you chose. Try a longer session cap, more training days, or fewer priority muscles.";
    }
    if (fact.constraint === "weekly_volume") {
      return "That combination asks for more weekly volume than can be recovered. Try fewer priority muscles or more training days.";
    }
  }
  return "That combination can't be turned into a workable plan. Try adjusting your schedule, split, or priority muscles.";
}

export const onboardingRouter = createTRPCRouter({
  createPlan: protectedProcedure
    .input(OnboardingInputSchema)
    .mutation(async ({ ctx, input }): Promise<{ mesocycleId: string }> => {
      const userId = ctx.session.user.id;

      // Defense-in-depth over the route gate: never overwrite an active block.
      const existing = await ctx.db.mesocycle.findFirst({
        where: { status: "ACTIVE", athleteProfile: { userId } },
        select: { id: true },
      });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "You already have an active block." });
      }

      // Read phase for the engine context without writing — an infeasible combo must persist nothing.
      const existingProfile = await ctx.db.athleteProfile.findUnique({
        where: { userId },
        select: { phase: true },
      });

      const csInput = buildConstraintSetInput(input);
      const athlete: AthleteContext = {
        experienceLevel: input.proficiency,
        phase: existingProfile?.phase ?? "MAINTAIN",
        landmarks: DEFAULT_LANDMARKS,
      };
      const spec = resolveConstraints(csInput, athlete);
      if (spec.kind !== "resolved") {
        // Nothing written yet — friendly error, athlete stays on the wizard.
        throw new TRPCError({ code: "BAD_REQUEST", message: infeasibilityMessage(spec) });
      }
      const plan = generateMesocycle(spec, EXERCISE_LIBRARY, DEFAULT_LANDMARKS);

      const { mesocycleId } = await ctx.db.$transaction(
        async (tx) => {
          const profile = await tx.athleteProfile.upsert({
            where: { userId },
            update: {
              sex: input.sex,
              age: input.age,
              heightCm: input.heightCm,
              weightKg: input.weightKg,
              experience: input.proficiency,
            },
            create: {
              userId,
              sex: input.sex,
              age: input.age,
              heightCm: input.heightCm,
              weightKg: input.weightKg,
              experience: input.proficiency,
            },
          });

          const last = await tx.constraintSet.findFirst({
            where: { athleteProfileId: profile.id },
            orderBy: { version: "desc" },
            select: { version: true },
          });
          const constraintSet = await tx.constraintSet.create({
            data: {
              athleteProfileId: profile.id,
              version: (last?.version ?? 0) + 1,
              isActive: true,
              daysPerWeek: csInput.daysPerWeek,
              splitType: csInput.splitType,
              sessionLengthCapMin: csInput.sessionLengthCapMin,
              blockLengthWeeks: csInput.blockLengthWeeks,
              deloadWeekIndex: csInput.deloadWeekIndex,
              checkInCadence: csInput.checkInCadence,
              muscleTargets: {
                create: csInput.muscleTargets.map((t) => ({
                  muscle: t.muscle,
                  weeklySetTarget: t.weeklySetTarget ?? null,
                  priority: t.priority ?? 0,
                })),
              },
            },
          });

          return persistMesocyclePlan(tx, {
            athleteProfileId: profile.id,
            constraintSetId: constraintSet.id,
            plan,
            startDate: new Date(), // brand-new block → current week 1
            name: "Block 1",
          });
        },
        { timeout: 15000 },
      );

      return { mesocycleId };
    }),
});
