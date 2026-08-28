import { describe, expect, it } from "vitest";
import { ALL_MUSCLES } from "./util";
import { buildSessionSlots } from "./split";

describe("buildSessionSlots", () => {
  it("upper/lower over 5 days alternates U,L,U,L,U", () => {
    const slots = buildSessionSlots("UPPER_LOWER", 5);
    expect(slots.map((s) => s.label)).toEqual([
      "Upper A", "Lower A", "Upper B", "Lower B", "Upper C",
    ]);
    expect(slots.map((s) => s.id)).toEqual([
      "upper-a", "lower-a", "upper-b", "lower-b", "upper-c",
    ]);
  });

  it("upper days are eligible for chest, lower days for quads — never crossed", () => {
    const slots = buildSessionSlots("UPPER_LOWER", 4);
    const upper = slots.filter((s) => s.label.startsWith("Upper"));
    const lower = slots.filter((s) => s.label.startsWith("Lower"));
    for (const s of upper) {
      expect(s.eligibleMuscles).toContain("CHEST");
      expect(s.eligibleMuscles).not.toContain("QUADS");
    }
    for (const s of lower) {
      expect(s.eligibleMuscles).toContain("QUADS");
      expect(s.eligibleMuscles).not.toContain("CHEST");
    }
  });

  it("full body makes every session eligible for every muscle", () => {
    const slots = buildSessionSlots("FULL_BODY", 3);
    expect(slots).toHaveLength(3);
    for (const s of slots) {
      expect([...s.eligibleMuscles].sort()).toEqual([...ALL_MUSCLES].sort());
    }
  });

  it("PPL over 6 days cycles push, pull, legs twice", () => {
    const slots = buildSessionSlots("PUSH_PULL_LEGS", 6);
    expect(slots.map((s) => s.label)).toEqual([
      "Push A", "Pull A", "Legs A", "Push B", "Pull B", "Legs B",
    ]);
  });

  it("produces exactly daysPerWeek slots with unique ids", () => {
    const slots = buildSessionSlots("PUSH_PULL_LEGS", 5);
    expect(slots).toHaveLength(5);
    expect(new Set(slots.map((s) => s.id)).size).toBe(5);
  });
});
