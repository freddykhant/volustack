import { describe, expect, it } from "vitest";
import { EMPTY_ACTIVITY_DRAFT, toAddInput } from "./activity-form";

describe("toAddInput", () => {
  it("builds an add input from a draft, with blank minutes as null", () => {
    expect(toAddInput({ ...EMPTY_ACTIVITY_DRAFT, kind: "RUN", intensity: "HARD", daypart: "AM", minutes: "" }, 2, "2026-10-20")).toEqual({
      weekIndex: 2, date: "2026-10-20", kind: "RUN", intensity: "HARD", daypart: "AM", durationMin: null,
    });
    expect(toAddInput({ ...EMPTY_ACTIVITY_DRAFT, minutes: " 45 " }, 1, "2026-10-20")).toMatchObject({ durationMin: 45 });
  });
  it("accepts the bounds themselves", () => {
    expect(toAddInput({ ...EMPTY_ACTIVITY_DRAFT, minutes: "5" }, 1, "2026-10-20")).toMatchObject({ durationMin: 5 });
    expect(toAddInput({ ...EMPTY_ACTIVITY_DRAFT, minutes: "600" }, 1, "2026-10-20")).toMatchObject({ durationMin: 600 });
  });
  it("explains a duration it can't send", () => {
    for (const minutes of ["4", "601", "4.5", "abc"]) {
      expect(toAddInput({ ...EMPTY_ACTIVITY_DRAFT, minutes }, 1, "2026-10-20")).toBe("Minutes should be a whole number from 5 to 600.");
    }
  });
});
