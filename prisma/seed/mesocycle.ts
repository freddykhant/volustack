import { db } from "~/server/db";
import { EXERCISE_LIBRARY } from "~/domain/exercise-library";
import { DEFAULT_LANDMARKS } from "~/domain/landmarks";
import { generateMesocycle, resolveConstraints, type AthleteContext } from "~/engine";
import { persistMesocyclePlan } from "~/server/mesocycle/persist";
import type { ConstraintSetInput } from "~/schema";

/** The default block character — mirrors the fixture (5 days, Upper/Lower, side-delts priority, 6-week, deload wk6). */
const DEFAULT_CONSTRAINTS: ConstraintSetInput = {
  daysPerWeek: 5,
  splitType: "UPPER_LOWER",
  sessionLengthCapMin: 75,
  blockLengthWeeks: 6,
  deloadWeekIndex: 6,
  checkInCadence: "WEEKLY",
  muscleTargets: [{ muscle: "SIDE_DELTS", priority: 3 }],
  excludedExerciseNames: [],
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Persists ONE engine-generated mesocycle for the target user, exercising the
 * write path end-to-end. Idempotent: re-running converges (prior seeded block +
 * constraint set for the athlete are deleted first).
 *
 * Target user: SEED_USER_EMAIL env var, else the first User row. Errors clearly
 * if no user exists (log in once to create your user, then re-run).
 */
export async function seedMesocycle(): Promise<{ mesocycleId: string; weeks: number }> {
  const email = process.env.SEED_USER_EMAIL;
  const user = email
    ? await db.user.findUnique({ where: { email } })
    : await db.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) {
    throw new Error(
      "seedMesocycle: no User found. Log in to the app once to create your user, then re-run `pnpm db:seed`.",
    );
  }

  // Athlete profile (upsert on the unique userId). Idempotent, so kept outside the tx.
  const profile = await db.athleteProfile.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id },
  });

  // Run the real engine (pure) before opening the transaction.
  const athlete: AthleteContext = {
    experienceLevel: profile.experience,
    phase: profile.phase,
    landmarks: DEFAULT_LANDMARKS,
  };
  const spec = resolveConstraints(DEFAULT_CONSTRAINTS, athlete);
  if (spec.kind !== "resolved") {
    throw new Error(
      "seedMesocycle: default constraints resolved as infeasible — the engine could not generate a plan.",
    );
  }
  const plan = generateMesocycle(spec, EXERCISE_LIBRARY, DEFAULT_LANDMARKS);

  // One atomic write: clear the prior seeded block + constraint set, create the
  // constraint set, then persist the plan graph. startDate 14 days ago → week 3.
  return db.$transaction(
    async (tx) => {
      await tx.mesocycle.deleteMany({ where: { athleteProfileId: profile.id } });
      await tx.constraintSet.deleteMany({ where: { athleteProfileId: profile.id } });

      const constraintSet = await tx.constraintSet.create({
        data: {
          athleteProfileId: profile.id,
          version: 1,
          isActive: true,
          daysPerWeek: DEFAULT_CONSTRAINTS.daysPerWeek,
          splitType: DEFAULT_CONSTRAINTS.splitType,
          sessionLengthCapMin: DEFAULT_CONSTRAINTS.sessionLengthCapMin,
          blockLengthWeeks: DEFAULT_CONSTRAINTS.blockLengthWeeks,
          deloadWeekIndex: DEFAULT_CONSTRAINTS.deloadWeekIndex,
          checkInCadence: DEFAULT_CONSTRAINTS.checkInCadence,
          muscleTargets: {
            create: DEFAULT_CONSTRAINTS.muscleTargets.map((t) => ({
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
        startDate: new Date(Date.now() - 14 * DAY_MS),
        name: "Autumn Hypertrophy — Block 1",
      });
    },
    { timeout: 15000 },
  );
}
