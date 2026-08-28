import { afterAll, describe, expect, it } from "vitest";
import { db } from "~/server/db";
import { seedExercises } from "./index";

describe("exercise seed round-trip", () => {
  afterAll(async () => {
    await db.$disconnect();
  });

  it("persists exercises with their fractional attribution", async () => {
    const count = await seedExercises();
    expect(count).toBe(12);

    const row = await db.exercise.findUnique({
      where: { name: "Barbell Row" },
      include: { muscles: true },
    });
    expect(row).not.toBeNull();

    const back = row!.muscles.find((m) => m.muscle === "BACK");
    expect(back?.role).toBe("PRIMARY");
    expect(back?.fraction).toBe(1.0);

    const biceps = row!.muscles.find((m) => m.muscle === "BICEPS");
    expect(biceps?.role).toBe("SECONDARY");
    expect(biceps?.fraction).toBe(0.5);
  });

  it("is idempotent — re-seeding does not duplicate muscle rows", async () => {
    await seedExercises();
    const row = await db.exercise.findUnique({
      where: { name: "Barbell Row" },
      include: { muscles: true },
    });
    expect(row!.muscles).toHaveLength(3);
  });
});
