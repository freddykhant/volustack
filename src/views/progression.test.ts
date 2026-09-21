// src/views/progression.test.ts
import { describe, expect, it } from "vitest";
import type { WeekAdjustment } from "~/engine";
import { toProgressionProposalView } from "./progression";

function adj(over: Partial<WeekAdjustment> = {}): WeekAdjustment {
  return {
    fromWeekIndex: 3,
    appliesToWeekIndex: 4,
    checkInValue: "low",
    facts: [],
    adjustments: [
      { muscle: "CHEST", plannedSets: 12, adjustedSets: 14, delta: 2, cause: "responding_well", swapCandidate: false },
      { muscle: "QUADS", plannedSets: 16, adjustedSets: 16, delta: 0, cause: "on_track", swapCandidate: false },
      { muscle: "GLUTES", plannedSets: 10, adjustedSets: 7, delta: -3, cause: "joint_stress", swapCandidate: true },
    ],
    ...over,
  };
}

describe("toProgressionProposalView", () => {
  it("kind CHANGES keeps only movers and swap-flagged rows", () => {
    const v = toProgressionProposalView(adj(), { hasUpcoming: true, upcomingIsDeload: false });
    expect(v.kind).toBe("CHANGES");
    expect(v.adjustments.map((a) => a.muscle)).toEqual(["CHEST", "GLUTES"]);
    expect(v.appliesToWeekIndex).toBe(4);
  });
  it("kind DELOAD_HOLD when next week is the deload", () => {
    expect(toProgressionProposalView(adj(), { hasUpcoming: true, upcomingIsDeload: true }).kind).toBe("DELOAD_HOLD");
  });
  it("kind BLOCK_END when there is no upcoming week", () => {
    expect(toProgressionProposalView(adj(), { hasUpcoming: false, upcomingIsDeload: false }).kind).toBe("BLOCK_END");
  });
  it("sets an advisory when checkInValue is high", () => {
    const v = toProgressionProposalView(adj({ checkInValue: "high" }), { hasUpcoming: true, upcomingIsDeload: false });
    expect(v.advisory).toBeTruthy();
  });
});
