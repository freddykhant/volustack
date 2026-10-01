import { describe, expect, it } from "vitest";
import { recoveryByWeekFromBlock, type BlockForRecovery } from "./recovery-by-week";

function block(weeks: BlockForRecovery["weeks"]): BlockForRecovery {
  return { weeks };
}

describe("recoveryByWeekFromBlock", () => {
  it("maps week.index → worst-biased recovery for weeks with a WEEK check-in", () => {
    const map = recoveryByWeekFromBlock(
      block([
        {
          index: 1,
          checkIns: [{ scope: "WEEK", muscleFeedback: [{ recovery: 0 }, { recovery: 1 }, { recovery: 3 }] }],
        },
      ]),
    );
    expect(map.get(1)).toBeCloseTo(0.5); // worst two: 0,1
  });

  it("omits weeks with no WEEK check-in", () => {
    const map = recoveryByWeekFromBlock(block([{ index: 2, checkIns: [] }]));
    expect(map.has(2)).toBe(false);
  });

  it("ignores non-WEEK check-ins", () => {
    const map = recoveryByWeekFromBlock(
      block([{ index: 3, checkIns: [{ scope: "SESSION", muscleFeedback: [{ recovery: 0 }] }] }]),
    );
    expect(map.has(3)).toBe(false);
  });

  it("maps to null when the WEEK check-in has no recovery values", () => {
    const map = recoveryByWeekFromBlock(
      block([{ index: 4, checkIns: [{ scope: "WEEK", muscleFeedback: [{ recovery: null }] }] }]),
    );
    expect(map.get(4)).toBeNull();
    expect(map.has(4)).toBe(true);
  });
});
