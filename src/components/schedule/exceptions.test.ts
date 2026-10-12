import { describe, expect, it } from "vitest";
import { makeInput } from "~/engine/_fixtures/schedule";
import { blockState } from "./exceptions";

const oneOff = (day: number, daypart: "AM" | "PM") => ({
  day,
  daypart,
  state: "BLOCKED" as const,
  oneOff: true,
});
const standing = (day: number, daypart: "AM" | "PM") => ({
  day,
  daypart,
  state: "BLOCKED" as const,
});

describe("blockState", () => {
  it("is past before the first open day, whatever else is true", () => {
    const input = makeInput({
      firstOpenDay: 2,
      availability: [oneOff(0, "AM"), oneOff(0, "PM")],
    });
    expect(blockState(input, 0, null)).toBe("past");
    expect(blockState(input, 2, null)).toBe("open");
  });

  it("counts the rolling week from its start day", () => {
    // Week starts Wednesday (2); Monday (0) is index 5.
    const input = makeInput({ weekStartDay: 2, firstOpenDay: 3 });
    expect(blockState(input, 2, null)).toBe("past");
    expect(blockState(input, 0, null)).toBe("open");
  });

  it("a whole day is one-off only when both halves are blocked", () => {
    expect(
      blockState(
        makeInput({ availability: [oneOff(3, "AM"), oneOff(3, "PM")] }),
        3,
        null,
      ),
    ).toBe("one_off");
    expect(
      blockState(makeInput({ availability: [oneOff(3, "AM")] }), 3, null),
    ).toBe("open");
  });

  it("a whole day is one-off when any half is a one-off, standing only when none is", () => {
    expect(
      blockState(
        makeInput({ availability: [standing(3, "AM"), oneOff(3, "PM")] }),
        3,
        null,
      ),
    ).toBe("one_off");
    expect(
      blockState(
        makeInput({ availability: [standing(3, "AM"), standing(3, "PM")] }),
        3,
        null,
      ),
    ).toBe("standing");
  });

  it("reads a half-day on its own", () => {
    const input = makeInput({
      mode: "HALF_DAY",
      availability: [oneOff(3, "PM"), standing(4, "AM")],
    });
    expect(blockState(input, 3, "PM")).toBe("one_off");
    expect(blockState(input, 3, "AM")).toBe("open");
    expect(blockState(input, 4, "AM")).toBe("standing");
  });
});
