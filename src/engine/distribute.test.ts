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
      { muscle: "CHEST", weeklySetTarget: 12, priority: 1, mev: 8, mav: 14, effectiveMrv: 22 },
      { muscle: "BACK", weeklySetTarget: 12, priority: 1, mev: 10, mav: 16, effectiveMrv: 25 },
      { muscle: "QUADS", weeklySetTarget: 10, priority: 0, mev: 8, mav: 14, effectiveMrv: 20 },
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
      targets: [{ muscle: "BACK", weeklySetTarget: 12, priority: 2, mev: 10, mav: 16, effectiveMrv: 25 }],
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

  it("moves sets to a cooler session when the time cap is exceeded and room exists elsewhere", () => {
    // BACK has 2 eligible sessions (Upper A / Upper B). A target of 5 (< FREQUENCY_THRESHOLD_SETS)
    // forces minSessions=1, so all 5 sets land in Upper A alone, pushing it to 25 min against
    // a 20-min cap while Upper B sits empty (8 min) — plenty of room to receive moved sets.
    const spec = specWith({
      sessionLengthCapMin: 20,
      targets: [{ muscle: "BACK", weeklySetTarget: 5, priority: 1, mev: 10, mav: 16, effectiveMrv: 25 }],
    });
    const slots = buildSessionSlots(spec.splitType, spec.daysPerWeek);
    const t = distributeVolume(spec, EXERCISE_LIBRARY, slots);

    const movedFacts = t.facts.filter((f) => f.kind === "moved_sets" && f.muscle === "BACK");
    expect(movedFacts.length).toBeGreaterThanOrEqual(1);
    expect(t.facts.some((f) => f.kind === "infeasible")).toBe(false);
    for (const s of t.sessions) {
      expect(s.estimatedMinutes).toBeLessThanOrEqual(spec.sessionLengthCapMin);
    }
    // total BACK sets are conserved (moved, not dropped)
    const totalBackSets = t.sessions
      .flatMap((s) => s.exercises)
      .filter((e) => e.exerciseName === "Barbell Row")
      .reduce((sum, e) => sum + e.sets, 0);
    expect(totalBackSets).toBe(5);
  });

  it("drops volume and records a session_time_cap deviation when no session has room to absorb it", () => {
    // FULL_BODY at 1 day/week yields a single session slot, so BACK has only one eligible
    // session — the time-cap repair pass can never find a destination and must drop sets.
    const spec = specWith({
      splitType: "FULL_BODY",
      daysPerWeek: 1,
      sessionLengthCapMin: 20,
      targets: [{ muscle: "BACK", weeklySetTarget: 10, priority: 1, mev: 10, mav: 16, effectiveMrv: 25 }],
    });
    const slots = buildSessionSlots(spec.splitType, spec.daysPerWeek);
    const t = distributeVolume(spec, EXERCISE_LIBRARY, slots);

    expect(
      t.facts.some(
        (f) => f.kind === "deviation" && f.cause === "session_time_cap" && f.muscle === "BACK",
      ),
    ).toBe(true);
    for (const s of t.sessions) {
      expect(s.estimatedMinutes).toBeLessThanOrEqual(spec.sessionLengthCapMin);
    }
  });

  it("trims isolation sets when secondary credit pushes a targeted muscle past target + 0.5", () => {
    // BICEPS target is fully met by 6 isolation (Barbell Curl) sets alone. BACK is then
    // trained with Barbell Row, whose secondary BICEPS credit (0.5/set × 3 sets = 1.5) pushes
    // BICEPS to 7.5 — past target(6) + 0.5. The trim pass should remove 1 Curl set, landing
    // BICEPS at 6.5 (within the +0.5 tolerance band).
    const spec = specWith({
      targets: [
        { muscle: "BICEPS", weeklySetTarget: 6, priority: 2, mev: 6, mav: 14, effectiveMrv: 20 },
        { muscle: "BACK", weeklySetTarget: 3, priority: 1, mev: 10, mav: 16, effectiveMrv: 25 },
      ],
    });
    const slots = buildSessionSlots(spec.splitType, spec.daysPerWeek);
    const t = distributeVolume(spec, EXERCISE_LIBRARY, slots);

    const trim = t.facts.find((f) => f.kind === "trimmed_overshoot" && f.muscle === "BICEPS");
    expect(trim).toBeDefined();
    if (trim?.kind === "trimmed_overshoot") {
      expect(trim.from).toBeGreaterThan(trim.to);
    }
    expect(Math.abs(t.achievedVolume.BICEPS - 6)).toBeLessThanOrEqual(0.5);
  });

  it("emits an infeasible fact when a session cannot be brought under an impossibly-low cap", () => {
    // No targets at all — the single FULL_BODY session still costs WARMUP_MIN (8 min) with
    // zero exercises, which already exceeds a 5-minute cap. The repair loop breaks immediately
    // (empty exercise list, nothing to move or drop), so only the new residual check can flag it.
    const spec = specWith({
      splitType: "FULL_BODY",
      daysPerWeek: 1,
      sessionLengthCapMin: 5,
      targets: [],
    });
    const slots = buildSessionSlots(spec.splitType, spec.daysPerWeek);
    const t = distributeVolume(spec, EXERCISE_LIBRARY, slots);

    expect(t.facts).toContainEqual({
      kind: "infeasible",
      constraint: "session_time",
      detail: { session: "full-body-a", requiredMin: 8, capMin: 5 },
    });
  });
});
