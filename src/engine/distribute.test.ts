// src/engine/distribute.test.ts
import { describe, expect, it } from "vitest";
import { EXERCISE_LIBRARY } from "~/domain/exercise-library";
import { distributeVolume } from "./distribute";
import { buildSessionSlots } from "./split";
import { sessionMinutes } from "./time";
import type { ResolvedSpec } from "./types";

function specWith(overrides: Partial<ResolvedSpec>): ResolvedSpec {
  return {
    kind: "resolved",
    daysPerWeek: 4,
    splitType: "UPPER_LOWER",
    sessionLengthCapMin: 60,
    blockLengthWeeks: 6,
    deloadWeekIndex: 6,
    isBeginner: false,
    excludedExerciseNames: [],
    facts: [],
    targets: [
      { muscle: "CHEST", weeklySetTarget: 12, priority: 1, mev: 8, effectiveMrv: 22 },
      { muscle: "BACK", weeklySetTarget: 12, priority: 1, mev: 10, effectiveMrv: 25 },
      { muscle: "QUADS", weeklySetTarget: 10, priority: 0, mev: 8, effectiveMrv: 20 },
    ],
    ...overrides,
  };
}

describe("distributeVolume", () => {
  it("hits chest target within ±0.5 sets", () => {
    const spec = specWith({});
    const slots = buildSessionSlots(spec.splitType, spec.daysPerWeek);
    const t = distributeVolume(spec, EXERCISE_LIBRARY, slots);
    expect(Math.abs(t.achievedVolume.CHEST - 12)).toBeLessThanOrEqual(0.5);
  });

  it("never exceeds the session time cap", () => {
    const spec = specWith({});
    const slots = buildSessionSlots(spec.splitType, spec.daysPerWeek);
    const t = distributeVolume(spec, EXERCISE_LIBRARY, slots);
    for (const s of t.sessions) {
      expect(sessionMinutes(s.exercises)).toBeLessThanOrEqual(spec.sessionLengthCapMin);
    }
  });

  it("never assigns an excluded exercise", () => {
    const spec = specWith({ excludedExerciseNames: ["Barbell Back Squat"] });
    const slots = buildSessionSlots(spec.splitType, spec.daysPerWeek);
    const t = distributeVolume(spec, EXERCISE_LIBRARY, slots);
    const names = t.sessions.flatMap((s) => s.exercises.map((e) => e.exerciseName));
    expect(names).not.toContain("Barbell Back Squat");
  });

  it("spreads a high-volume muscle across ≥2 sessions and records a fact", () => {
    const spec = specWith({
      targets: [{ muscle: "BACK", weeklySetTarget: 12, priority: 2, mev: 10, effectiveMrv: 25 }],
    });
    const slots = buildSessionSlots(spec.splitType, spec.daysPerWeek);
    const t = distributeVolume(spec, EXERCISE_LIBRARY, slots);
    const sessionsTrainingBack = t.sessions.filter((s) =>
      s.exercises.some((e) => EXERCISE_LIBRARY.find((x) => x.name === e.exerciseName)!.muscles.some((m) => m.muscle === "BACK" && m.role === "PRIMARY")),
    );
    expect(sessionsTrainingBack.length).toBeGreaterThanOrEqual(2);
    expect(t.facts.some((f) => f.kind === "split_volume" && f.muscle === "BACK")).toBe(true);
  });

  it("is deterministic — same input, deep-equal output", () => {
    const spec = specWith({});
    const slots = buildSessionSlots(spec.splitType, spec.daysPerWeek);
    const a = distributeVolume(spec, EXERCISE_LIBRARY, slots);
    const b = distributeVolume(spec, EXERCISE_LIBRARY, slots);
    expect(a).toEqual(b);
  });
});
