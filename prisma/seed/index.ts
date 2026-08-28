import { fileURLToPath } from "node:url";

import { EXERCISE_LIBRARY } from "~/domain/exercise-library";
import { db } from "~/server/db";

/**
 * Writes the MVP exercise library to the database. Idempotent: matches on the
 * unique exercise name and replaces the muscle attribution rows wholesale, so
 * re-running after editing the library converges rather than duplicating.
 *
 * @returns the number of exercises upserted
 */
export async function seedExercises(): Promise<number> {
  for (const ex of EXERCISE_LIBRARY) {
    const muscleRows = ex.muscles.map((m) => ({
      muscle: m.muscle,
      role: m.role,
      fraction: m.fraction,
    }));

    await db.exercise.upsert({
      where: { name: ex.name },
      update: {
        movementPattern: ex.movementPattern,
        equipment: ex.equipment,
        contraindications: { set: ex.contraindications },
        muscles: {
          deleteMany: {},
          create: muscleRows,
        },
      },
      create: {
        name: ex.name,
        movementPattern: ex.movementPattern,
        equipment: ex.equipment,
        contraindications: ex.contraindications,
        muscles: { create: muscleRows },
      },
    });
  }

  return EXERCISE_LIBRARY.length;
}

async function main() {
  const count = await seedExercises();
  console.log(`Seeded ${count} exercises.`);
}

// Only run (and disconnect) when executed directly, e.g. `prisma db seed`.
// seed.test.ts imports seedExercises from this module; without this guard the
// import would kick off a second concurrent seed and then tear down the shared
// Prisma client mid-test ("Engine is not yet connected").
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main()
    .catch((e: unknown) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => void db.$disconnect());
}
