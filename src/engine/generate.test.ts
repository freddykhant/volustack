// src/engine/generate.test.ts
import { describe, expect, it } from "vitest";
import { DEFAULT_LANDMARKS } from "~/domain/landmarks";
import { EXERCISE_LIBRARY } from "~/domain/exercise-library";
import { generateMesocycle } from "./generate";
import type { ResolvedSpec } from "./types";

function spec(overrides: Partial<ResolvedSpec> = {}): ResolvedSpec {
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
      { muscle: "CHEST", weeklySetTarget: 16, priority: 1, mev: 8, effectiveMrv: 22 },
      { muscle: "BACK", weeklySetTarget: 16, priority: 1, mev: 10, effectiveMrv: 25 },
      { muscle: "QUADS", weeklySetTarget: 12, priority: 0, mev: 8, effectiveMrv: 20 },
    ],
    ...overrides,
  };
}

describe("generateMesocycle", () => {
  it("produces one week per block week", () => {
    const plan = generateMesocycle(spec(), EXERCISE_LIBRARY, DEFAULT_LANDMARKS);
    expect(plan.weeks.map((w) => w.index)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("marks only the deload week as deload", () => {
    const plan = generateMesocycle(spec(), EXERCISE_LIBRARY, DEFAULT_LANDMARKS);
    expect(plan.weeks.filter((w) => w.isDeload).map((w) => w.index)).toEqual([6]);
  });

  it("ramps chest volume up to peak at the last accumulation week", () => {
    const plan = generateMesocycle(spec(), EXERCISE_LIBRARY, DEFAULT_LANDMARKS);
    const wk1 = plan.weeks[0]!.muscleVolume.CHEST;
    const wk5 = plan.weeks[4]!.muscleVolume.CHEST; // last accumulation week
    expect(wk5).toBeGreaterThanOrEqual(wk1);
    expect(wk1).toBeGreaterThan(0);
  });

  it("deload volume is roughly half of week 1", () => {
    const plan = generateMesocycle(spec(), EXERCISE_LIBRARY, DEFAULT_LANDMARKS);
    const wk1 = plan.weeks[0]!.muscleVolume.CHEST;
    const deload = plan.weeks[5]!.muscleVolume.CHEST;
    expect(deload).toBeLessThan(wk1);
    expect(deload).toBeGreaterThan(0);
  });

  it("no week's muscle volume exceeds the effective MRV", () => {
    const plan = generateMesocycle(spec(), EXERCISE_LIBRARY, DEFAULT_LANDMARKS);
    for (const w of plan.weeks) {
      for (const t of spec().targets) {
        expect(w.muscleVolume[t.muscle]).toBeLessThanOrEqual(t.effectiveMrv + 0.5);
      }
    }
  });

  it("uses higher RIR on the deload week", () => {
    const plan = generateMesocycle(spec(), EXERCISE_LIBRARY, DEFAULT_LANDMARKS);
    const deloadRir = plan.weeks[5]!.sessions.flatMap((s) => s.prescriptions).map((p) => p.targetRir);
    const accumRir = plan.weeks[0]!.sessions.flatMap((s) => s.prescriptions).map((p) => p.targetRir);
    expect(Math.min(...deloadRir)).toBeGreaterThan(Math.max(...accumRir));
  });

  it("keeps volume flat across accumulation weeks for beginners", () => {
    const plan = generateMesocycle(spec({ isBeginner: true }), EXERCISE_LIBRARY, DEFAULT_LANDMARKS);
    const chestByWeek = plan.weeks.slice(0, 5).map((w) => w.muscleVolume.CHEST);
    for (const v of chestByWeek) expect(v).toBe(chestByWeek[0]);
  });

  it("carries forward resolver and distributor facts", () => {
    const s = spec({ facts: [{ kind: "beginner_locked", detail: "x" }] });
    const plan = generateMesocycle(s, EXERCISE_LIBRARY, DEFAULT_LANDMARKS);
    expect(plan.facts.some((f) => f.kind === "beginner_locked")).toBe(true);
  });
});
