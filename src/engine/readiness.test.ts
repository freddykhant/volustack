import { describe, expect, it } from "vitest";
import {
  computeReadiness,
  sessionStimulus,
  weeklyRecoverySignal,
  type LoadEvent,
  type WeekEnd,
} from "./readiness";

describe("sessionStimulus", () => {
  it("weights sets by RIR (null→0.7, ≤1→1.0, ≤3→0.7, ≥4→0.4)", () => {
    expect(sessionStimulus([{ achievedRir: 0 }, { achievedRir: 1 }])).toBeCloseTo(2.0);
    expect(sessionStimulus([{ achievedRir: 2 }, { achievedRir: 3 }])).toBeCloseTo(1.4);
    expect(sessionStimulus([{ achievedRir: 4 }, { achievedRir: 6 }])).toBeCloseTo(0.8);
    expect(sessionStimulus([{ achievedRir: null }])).toBeCloseTo(0.7);
    expect(sessionStimulus([])).toBe(0);
  });
});

describe("computeReadiness", () => {
  const weeks: WeekEnd[] = [1, 2, 3].map((w) => ({ weekIndex: w, dayOffset: w * 7 - 1 }));

  it("returns [] for no events", () => {
    expect(computeReadiness([], weeks)).toEqual([]);
  });

  it("fatigue reacts faster than fitness to a load block, so form goes negative then recovers", () => {
    // heavy load days 0-13 (weeks 1-2), then rest through week 3
    const events: LoadEvent[] = [];
    for (let d = 0; d < 14; d++) events.push({ dayOffset: d, load: 10 });
    const out = computeReadiness(events, weeks, { tauFit: 21, tauFat: 7 });
    expect(out.map((s) => s.weekIndex)).toEqual([1, 2, 3]);
    // during loading, fatigue > fitness → form negative
    expect(out[1]!.form).toBeLessThan(0);
    expect(out[1]!.fatigue).toBeGreaterThan(out[1]!.fitness);
    // after a rest week, fatigue decays below fitness → form rebounds upward
    expect(out[2]!.form).toBeGreaterThan(out[1]!.form);
  });

  it("samples the decayed curve at each week end even for weeks with no load", () => {
    const out = computeReadiness([{ dayOffset: 0, load: 10 }], weeks);
    expect(out).toHaveLength(3);
    // fitness present at week 1, still decaying (not zero) by week 3
    expect(out[0]!.fitness).toBeGreaterThan(0);
    expect(out[2]!.fitness).toBeGreaterThan(0);
  });
});

describe("weeklyRecoverySignal", () => {
  it("averages the two least-recovered muscles (worst-biased)", () => {
    expect(weeklyRecoverySignal([0, 1, 2, 3])).toBeCloseTo(0.5); // worst two: 0,1
  });

  it("averages all when fewer than RECOVERY_WORST_N muscles reported", () => {
    expect(weeklyRecoverySignal([3, 1])).toBeCloseTo(2); // both count
    expect(weeklyRecoverySignal([2])).toBeCloseTo(2);
  });

  it("ignores nulls", () => {
    expect(weeklyRecoverySignal([null, 2, null, 0])).toBeCloseTo(1); // worst two of {2,0}: 0,2
  });

  it("returns null when no muscle reported a value", () => {
    expect(weeklyRecoverySignal([null, null])).toBeNull();
    expect(weeklyRecoverySignal([])).toBeNull();
  });
});
