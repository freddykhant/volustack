import { describe, expect, it } from "vitest";
import type { ExerciseDef } from "~/domain/exercise-library";
import type { ResolvedMuscleTarget } from "~/engine";
import { derivePerformance, type WeekForPerformance } from "./derive-performance";

const lib: ExerciseDef[] = [
  { name: "Bench Press", movementPattern: "COMPOUND", equipment: "BARBELL", muscles: [{ muscle: "CHEST", role: "PRIMARY", fraction: 1 }] },
  { name: "Leg Curl", movementPattern: "ISOLATION", equipment: "MACHINE", muscles: [{ muscle: "HAMSTRINGS", role: "PRIMARY", fraction: 1 }] },
] as unknown as ExerciseDef[];

const targets = [
  { muscle: "CHEST", weeklySetTarget: 12, priority: 1, mev: 8, mav: 14, effectiveMrv: 20 },
  { muscle: "HAMSTRINGS", weeklySetTarget: 10, priority: 1, mev: 6, mav: 12, effectiveMrv: 16 },
] as ResolvedMuscleTarget[];

function rx(exerciseName: string, t: { low: number | null; high: number | null; rir: number | null }, logs: { reps: number; achievedRir: number | null }[]) {
  return { exerciseName, targetRepLow: t.low, targetRepHigh: t.high, targetRir: t.rir, setLogs: logs };
}

describe("derivePerformance", () => {
  it("scores 3 when reps beat the top of range at/under target RIR", () => {
    const week: WeekForPerformance = { prescriptions: [rx("Bench Press", { low: 8, high: 12, rir: 2 }, [{ reps: 12, achievedRir: 1 }, { reps: 13, achievedRir: 2 }])] };
    expect(derivePerformance(week, targets, lib).get("CHEST")).toBe(3);
  });
  it("scores 0 when reps collapse well below the range", () => {
    const week: WeekForPerformance = { prescriptions: [rx("Bench Press", { low: 8, high: 12, rir: 2 }, [{ reps: 5, achievedRir: 0 }])] };
    expect(derivePerformance(week, targets, lib).get("CHEST")).toBe(0);
  });
  it("returns undefined for a trained muscle with no logged sets", () => {
    const week: WeekForPerformance = { prescriptions: [rx("Bench Press", { low: 8, high: 12, rir: 2 }, [])] };
    expect(derivePerformance(week, targets, lib).get("CHEST")).toBeUndefined();
  });
  it("skips prescriptions with null targets (unjudgeable)", () => {
    const week: WeekForPerformance = { prescriptions: [rx("Leg Curl", { low: null, high: null, rir: null }, [{ reps: 10, achievedRir: 1 }])] };
    expect(derivePerformance(week, targets, lib).get("HAMSTRINGS")).toBeUndefined();
  });
  it("only reports muscles trained as PRIMARY this week", () => {
    const week: WeekForPerformance = { prescriptions: [rx("Bench Press", { low: 8, high: 12, rir: 2 }, [{ reps: 10, achievedRir: 2 }])] };
    const out = derivePerformance(week, targets, lib);
    expect(out.has("HAMSTRINGS")).toBe(false);
    expect(out.get("CHEST")).toBe(2);
  });
  it("scores 1 when in-range reps but RIR is loose", () => {
    const week: WeekForPerformance = { prescriptions: [rx("Bench Press", { low: 8, high: 12, rir: 2 }, [{ reps: 10, achievedRir: 4 }])] };
    expect(derivePerformance(week, targets, lib).get("CHEST")).toBe(1);
  });
  it("scores 1 when reps overshoot but RIR is very loose", () => {
    const week: WeekForPerformance = { prescriptions: [rx("Bench Press", { low: 8, high: 12, rir: 2 }, [{ reps: 15, achievedRir: 4 }])] };
    expect(derivePerformance(week, targets, lib).get("CHEST")).toBe(1);
  });
  it("scores 2 when reps overshoot but RIR is acceptable", () => {
    const week: WeekForPerformance = { prescriptions: [rx("Bench Press", { low: 8, high: 12, rir: 2 }, [{ reps: 15, achievedRir: 3 }])] };
    expect(derivePerformance(week, targets, lib).get("CHEST")).toBe(2);
  });
});
