import { describe, expect, it } from "vitest";
import { coachAppliedNotice, type AppliedWeek } from "./applied-notice";

const week = (
  weekIndex: number,
  moved: string[] = [],
  needsChoice = false,
): AppliedWeek => ({ weekIndex, moved, needsChoice });

describe("coachAppliedNotice", () => {
  it("reports what moved in the current week, with no links", () => {
    expect(coachAppliedNotice([week(2, ["Push", "Pull"])], 2)).toEqual({
      text: "Re-arranged: Push, Pull.",
      weekLinks: [],
    });
  });

  it("reports a later week that moved, with a link", () => {
    expect(coachAppliedNotice([week(2), week(3, ["Legs"])], 2)).toEqual({
      text: "Week 3: Legs.",
      weekLinks: [3],
    });
  });

  it("reports a later week that needs a choice, with a link", () => {
    expect(coachAppliedNotice([week(2), week(4, [], true)], 2)).toEqual({
      text: "Week 4 needs a choice when you open it.",
      weekLinks: [4],
    });
  });

  it("combines the current week with later weeks and links only those that changed", () => {
    expect(
      coachAppliedNotice(
        [week(2, ["Push"]), week(3, ["Legs"]), week(4), week(5, [], true)],
        2,
      ),
    ).toEqual({
      text: "Re-arranged: Push. Week 3: Legs. Week 5 needs a choice when you open it.",
      weekLinks: [3, 5],
    });
  });

  it("is null when nothing moved or needs a choice", () => {
    expect(coachAppliedNotice([week(2), week(3)], 2)).toBeNull();
    expect(coachAppliedNotice([], 2)).toBeNull();
  });
});
