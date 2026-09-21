import { describe, expect, it } from "vitest";
import { readinessInputsFromBlock, type BlockForReadiness } from "./readiness-inputs";

const start = new Date("2026-01-01T00:00:00Z");
function block(over: Partial<BlockForReadiness> = {}): BlockForReadiness {
  return {
    startDate: start,
    lengthWeeks: 2,
    weeks: [
      {
        sessions: [
          {
            status: "COMPLETED",
            completedAt: new Date("2026-01-02T10:00:00Z"), // day 1
            prescriptions: [{ setLogs: [{ achievedRir: 1 }, { achievedRir: 1 }] }],
          },
          {
            status: "SCHEDULED",
            completedAt: null,
            prescriptions: [{ setLogs: [] }],
          },
        ],
      },
    ],
    ...over,
  };
}

describe("readinessInputsFromBlock", () => {
  it("returns null when the block has no startDate", () => {
    expect(readinessInputsFromBlock(block({ startDate: null }))).toBeNull();
  });
  it("emits an event only for COMPLETED sessions, at completedAt's day offset", () => {
    const out = readinessInputsFromBlock(block());
    expect(out).not.toBeNull();
    expect(out!.events).toEqual([{ dayOffset: 1, load: 2 }]); // two RIR-1 sets → 2.0
  });
  it("emits a week end at w*7-1 for each week", () => {
    const out = readinessInputsFromBlock(block());
    expect(out!.weekEnds).toEqual([
      { weekIndex: 1, dayOffset: 6 },
      { weekIndex: 2, dayOffset: 13 },
    ]);
  });
});
