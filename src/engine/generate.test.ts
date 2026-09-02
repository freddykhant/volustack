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
      { muscle: "CHEST", weeklySetTarget: 16, priority: 1, mev: 8, mav: 14, effectiveMrv: 22 },
      { muscle: "BACK", weeklySetTarget: 16, priority: 1, mev: 10, mav: 16, effectiveMrv: 25 },
      { muscle: "QUADS", weeklySetTarget: 12, priority: 0, mev: 8, mav: 14, effectiveMrv: 20 },
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

  it("ramps chest volume from ~75% of peak at week 1 up to peak at the last accumulation week", () => {
    // CHEST target is 16 with mev 8, so 0.75*16=12 is well above the MEV floor and the
    // floor cannot be masking a flat ramp here. A broken (per-session) floor/clamp
    // pushes every accumulation week up to the full peak immediately; the correct
    // week-aggregate fix must show a real, strictly increasing ramp.
    const plan = generateMesocycle(spec(), EXERCISE_LIBRARY, DEFAULT_LANDMARKS);
    const wk1 = plan.weeks[0]!.muscleVolume.CHEST;
    const peak = plan.weeks[4]!.muscleVolume.CHEST; // last accumulation week
    expect(peak).toBe(16); // peak equals the distributor's own target — floor/clamp no-op at peak
    expect(wk1).toBeLessThanOrEqual(peak - 1); // strictly below peak, not flattened
    expect(wk1).toBeGreaterThanOrEqual(0.65 * peak);
    expect(wk1).toBeLessThanOrEqual(0.85 * peak);
  });

  it("deload volume is within a real ~0.4-0.6x band of week 1", () => {
    const plan = generateMesocycle(spec(), EXERCISE_LIBRARY, DEFAULT_LANDMARKS);
    const wk1 = plan.weeks[0]!.muscleVolume.CHEST;
    const deload = plan.weeks[5]!.muscleVolume.CHEST;
    expect(deload).toBeGreaterThanOrEqual(0.4 * wk1);
    expect(deload).toBeLessThanOrEqual(0.6 * wk1);
    expect(deload).toBeGreaterThan(0);
  });

  it("enforces the weekly effective MRV via week-aggregated clamping and records a fact", () => {
    // Hand-built spec designed so TRICEPS' weekly volume is driven mostly by SECONDARY
    // credit from CHEST pressing (untouchable by the isolation-only clamp), exceeding
    // effectiveMrv=18 by exactly 0.5 at the peak week. A per-session bug would never see
    // this: each session's slice is far below 18 and clampToMrv would never fire, so no
    // ramp_flattened fact would ever be recorded even though the weekly total is over.
    const s = spec({
      sessionLengthCapMin: 300, // remove the time cap as a confound; we're isolating MRV behavior
      targets: [
        { muscle: "CHEST", weeklySetTarget: 37, priority: 1, mev: 8, mav: 14, effectiveMrv: 50 },
        { muscle: "TRICEPS", weeklySetTarget: 1, priority: 0, mev: 1, mav: 12, effectiveMrv: 18 },
      ],
    });
    const plan = generateMesocycle(s, EXERCISE_LIBRARY, DEFAULT_LANDMARKS);
    for (const w of plan.weeks) {
      expect(w.muscleVolume.TRICEPS).toBeLessThanOrEqual(18 + 0.5);
    }
    const flattened = plan.facts.filter(
      (f) => f.kind === "ramp_flattened" && f.muscle === "TRICEPS",
    );
    expect(flattened.length).toBeGreaterThan(0);
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
