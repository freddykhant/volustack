import { describe, expect, it } from "vitest";
import {
  blendRecovery,
  computeReadiness,
  sessionStimulus,
  weeklyRecoverySignal,
  type LoadEvent,
  type ReadinessSample,
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

describe("blendRecovery", () => {
  // load-form: fitness 20, fatigue 10, form 10
  const base: ReadinessSample[] = [{ weekIndex: 1, fitness: 20, fatigue: 10, form: 10 }];

  it("neutral recovery (2) is the identity", () => {
    expect(blendRecovery(base, new Map([[1, 2]]))).toEqual(base);
  });

  it("wrecked (0) drops Form by ~15% of fitness (Fatigue up)", () => {
    const [s] = blendRecovery(base, new Map([[1, 0]]));
    expect(s!.fatigue).toBeCloseTo(13); // +0.15*20
    expect(s!.form).toBeCloseTo(7); // 20 - 13
    expect(s!.fitness).toBe(20); // untouched
  });

  it("fresh (3) lifts Form by ~7.5% of fitness (Fatigue down)", () => {
    const [s] = blendRecovery(base, new Map([[1, 3]]));
    expect(s!.fatigue).toBeCloseTo(8.5); // -0.5*0.15*20
    expect(s!.form).toBeCloseTo(11.5);
  });

  it("passes weeks through unchanged when absent from the map or mapped to null", () => {
    expect(blendRecovery(base, new Map())).toEqual(base);
    expect(blendRecovery(base, new Map([[1, null]]))).toEqual(base);
  });

  it("pass-through week is returned referentially unchanged (no re-rounding)", () => {
    const samples: ReadinessSample[] = [{ weekIndex: 5, fitness: 1.44, fatigue: 0.96, form: 0.5 }];
    const out = blendRecovery(samples, new Map()); // week 5 absent → no nudge
    expect(out[0]).toBe(samples[0]); // same object reference, untouched
    expect(out[0]!.form).toBe(0.5);  // computeReadiness's original form preserved verbatim
  });

  it("preserves form === round1(fitness - fatigue) on every output", () => {
    const samples: ReadinessSample[] = [
      { weekIndex: 1, fitness: 17.3, fatigue: 9.1, form: 8.2 },
      { weekIndex: 2, fitness: 22.6, fatigue: 14.4, form: 8.2 },
    ];
    const out = blendRecovery(samples, new Map([[1, 0], [2, 3]]));
    for (const s of out) expect(s.form).toBeCloseTo(Math.round((s.fitness - s.fatigue) * 10) / 10);
  });

  it("returns [] for an empty series", () => {
    expect(blendRecovery([], new Map([[1, 0]]))).toEqual([]);
  });
});
