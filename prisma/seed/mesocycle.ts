import { db } from "~/server/db";
import { EXERCISE_LIBRARY } from "~/domain/exercise-library";
import { DEFAULT_LANDMARKS } from "~/domain/landmarks";
import { generateMesocycle, resolveConstraints, type AthleteContext } from "~/engine";
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

  // 1. Athlete profile (upsert on the unique userId).
  const profile = await db.athleteProfile.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id },
  });

  // 2. Idempotency: clear any prior seeded block + constraint set for this athlete.
  await db.mesocycle.deleteMany({ where: { athleteProfileId: profile.id } });
  await db.constraintSet.deleteMany({ where: { athleteProfileId: profile.id } });

  // 3. Persist the constraint set the engine will run against.
  const constraintSet = await db.constraintSet.create({
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

  // 4. Run the real engine.
  const athlete: AthleteContext = {
    experienceLevel: profile.experience,
    phase: profile.phase,
    landmarks: DEFAULT_LANDMARKS,
  };
  const spec = resolveConstraints(DEFAULT_CONSTRAINTS, athlete);
  if (spec.kind !== "resolved") {
    throw new Error("seedMesocycle: default constraints resolved as infeasible — the engine could not generate a plan.");
  }
  const plan = generateMesocycle(spec, EXERCISE_LIBRARY, DEFAULT_LANDMARKS);

  // Resolve exercise names → ids up front; a generated plan must only reference library exercises.
  const exercises = await db.exercise.findMany({ select: { id: true, name: true } });
  const idByName = new Map(exercises.map((e) => [e.name, e.id]));

  // 5. Persist the mesocycle graph. startDate 14 days ago → current week 3.
  const meso = await db.mesocycle.create({
    data: {
      athleteProfileId: profile.id,
      constraintSetId: constraintSet.id,
      name: "Autumn Hypertrophy — Block 1",
      status: "ACTIVE",
      startDate: new Date(Date.now() - 14 * DAY_MS),
      lengthWeeks: plan.blockLengthWeeks,
    },
  });

  for (const week of plan.weeks) {
    const persistedWeek = await db.week.create({
      data: {
        mesocycleId: meso.id,
        index: week.index,
        isDeload: week.isDeload,
        muscleVolumes: {
          create: Object.entries(week.muscleVolume)
            .filter(([, sets]) => sets > 0)
            .map(([muscle, sets]) => ({
              muscle: muscle as (typeof EXERCISE_LIBRARY)[number]["muscles"][number]["muscle"],
              plannedSets: sets,
            })),
        },
      },
    });

    for (const [order, session] of week.sessions.entries()) {
      await db.trainingSession.create({
        data: {
          weekId: persistedWeek.id,
          order,
          splitSlot: session.label,
          dayOfWeek: null,
          targetDurationMin: session.estimatedMinutes,
          prescriptions: {
            create: session.prescriptions.map((rx, rxOrder) => {
              const exerciseId = idByName.get(rx.exerciseName);
              if (!exerciseId) {
                throw new Error(
                  `seedMesocycle: prescription references unknown exercise "${rx.exerciseName}". Run the exercise seed first / check the library.`,
                );
              }
              return {
                exerciseId,
                order: rxOrder,
                sets: rx.sets,
                targetRepLow: rx.repRangeLow,
                targetRepHigh: rx.repRangeHigh,
                targetRir: rx.targetRir,
              };
            }),
          },
        },
      });
    }
  }

  // 6. DecisionLog rows from the plan's facts (used by later slices; mapper ignores them).
  if (plan.facts.length > 0) {
    await db.decisionLog.createMany({
      data: plan.facts.map((fact) => ({
        mesocycleId: meso.id,
        type: "GENERATE" as const,
        status: "APPLIED" as const,
        summary: fact.kind,
        reasoning: fact.kind,
        payload: fact,
      })),
    });
  }

  return { mesocycleId: meso.id, weeks: plan.weeks.length };
}
