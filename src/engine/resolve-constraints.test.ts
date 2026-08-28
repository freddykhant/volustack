// src/engine/resolve-constraints.test.ts
import { describe, expect, it } from "vitest";
import { DEFAULT_LANDMARKS } from "~/domain/landmarks";
import type { ConstraintSetInput } from "~/schema";
import { resolveConstraints } from "./resolve-constraints";
import type { AthleteContext } from "./types";

const intermediate: AthleteContext = {
  experienceLevel: "INTERMEDIATE",
  phase: "MAINTAIN",
  landmarks: DEFAULT_LANDMARKS,
};

const baseInput: ConstraintSetInput = {
  daysPerWeek: 5,
  splitType: "UPPER_LOWER",
  sessionLengthCapMin: 60,
  blockLengthWeeks: 6,
  checkInCadence: "WEEKLY",
  muscleTargets: [{ muscle: "CHEST", weeklySetTarget: 16, priority: 1 }],
  excludedExerciseNames: [],
};

describe("resolveConstraints", () => {
  it("keeps a specified target and fills untargeted muscles at MEV", () => {
    const r = resolveConstraints(baseInput, intermediate);
    expect(r.kind).toBe("resolved");
    if (r.kind !== "resolved") return;
    const chest = r.targets.find((t) => t.muscle === "CHEST")!;
    expect(chest.weeklySetTarget).toBe(16);
    const biceps = r.targets.find((t) => t.muscle === "BICEPS")!;
    expect(biceps.weeklySetTarget).toBe(DEFAULT_LANDMARKS.BICEPS.mev);
    expect(r.facts.some((f) => f.kind === "filled_default" && f.muscle === "BICEPS")).toBe(true);
  });

  it("defaults deloadWeekIndex to the last week", () => {
    const r = resolveConstraints(baseInput, intermediate);
    if (r.kind !== "resolved") return;
    expect(r.deloadWeekIndex).toBe(6);
  });

  it("clamps a target above effective MRV and records a fact", () => {
    const r = resolveConstraints(
      { ...baseInput, muscleTargets: [{ muscle: "CHEST", weeklySetTarget: 99, priority: 1 }] },
      intermediate,
    );
    if (r.kind !== "resolved") return;
    const chest = r.targets.find((t) => t.muscle === "CHEST")!;
    expect(chest.weeklySetTarget).toBe(DEFAULT_LANDMARKS.CHEST.mrv); // MAINTAIN → factor 1
    expect(r.facts.some((f) => f.kind === "clamped_to_mrv" && f.muscle === "CHEST")).toBe(true);
  });

  it("modulates effective MRV on a cut", () => {
    const r = resolveConstraints(baseInput, { ...intermediate, phase: "CUT" });
    if (r.kind !== "resolved") return;
    const chest = r.targets.find((t) => t.muscle === "CHEST")!;
    expect(chest.effectiveMrv).toBe(Math.round(DEFAULT_LANDMARKS.CHEST.mrv * 0.85));
    expect(r.facts.some((f) => f.kind === "phase_modulated" && f.muscle === "CHEST")).toBe(true);
  });

  it("locks beginners to flat MEV–MAV midpoint volume with a fact", () => {
    const r = resolveConstraints(baseInput, { ...intermediate, experienceLevel: "BEGINNER" });
    if (r.kind !== "resolved") return;
    expect(r.isBeginner).toBe(true);
    const chest = r.targets.find((t) => t.muscle === "CHEST")!;
    const { mev, mav } = DEFAULT_LANDMARKS.CHEST;
    expect(chest.weeklySetTarget).toBe(Math.round((mev + mav) / 2)); // user target ignored
    expect(r.facts.some((f) => f.kind === "beginner_locked")).toBe(true);
  });

  it("sorts targets by priority desc, then target desc, then name asc", () => {
    const r = resolveConstraints(baseInput, intermediate);
    if (r.kind !== "resolved") return;
    for (let i = 1; i < r.targets.length; i++) {
      const a = r.targets[i - 1]!;
      const b = r.targets[i]!;
      const rank =
        b.priority - a.priority ||
        b.weeklySetTarget - a.weeklySetTarget ||
        a.muscle.localeCompare(b.muscle);
      expect(rank).toBeLessThanOrEqual(0);
    }
  });

  it("reports infeasibility when required volume cannot fit the weekly time budget", () => {
    const r = resolveConstraints(
      {
        ...baseInput,
        daysPerWeek: 2,
        sessionLengthCapMin: 20,
        muscleTargets: [
          { muscle: "CHEST", weeklySetTarget: 22, priority: 5 },
          { muscle: "BACK", weeklySetTarget: 25, priority: 5 },
          { muscle: "QUADS", weeklySetTarget: 20, priority: 5 },
        ],
      },
      intermediate,
    );
    expect(r.kind).toBe("infeasible");
    if (r.kind !== "infeasible") return;
    expect(r.facts.some((f) => f.kind === "infeasible" && f.constraint === "session_time")).toBe(true);
  });
});
