import { describe, expect, it } from "vitest";
import { LogSessionInputSchema, LogSetInputSchema } from "./logging";

const set = { prescriptionId: "rx1", setNumber: 1, weightKg: 60, reps: 8, achievedRir: 2 };

describe("LogSetInputSchema", () => {
  it("accepts a valid set", () => {
    expect(LogSetInputSchema.parse(set)).toMatchObject(set);
  });
  it("allows a bodyweight set (weight 0) and omitted RIR", () => {
    const { achievedRir, ...rest } = set;
    expect(LogSetInputSchema.parse({ ...rest, weightKg: 0 }).achievedRir).toBeUndefined();
  });
  it("rejects setNumber < 1, negative weight/reps, and RIR out of 0–10", () => {
    expect(LogSetInputSchema.safeParse({ ...set, setNumber: 0 }).success).toBe(false);
    expect(LogSetInputSchema.safeParse({ ...set, weightKg: -1 }).success).toBe(false);
    expect(LogSetInputSchema.safeParse({ ...set, reps: -1 }).success).toBe(false);
    expect(LogSetInputSchema.safeParse({ ...set, achievedRir: 11 }).success).toBe(false);
  });
});

describe("LogSessionInputSchema", () => {
  it("accepts a session with sets and an empty session", () => {
    expect(LogSessionInputSchema.parse({ sessionId: "s1", sets: [set] }).sets).toHaveLength(1);
    expect(LogSessionInputSchema.parse({ sessionId: "s1", sets: [] }).sets).toEqual([]);
  });
});
