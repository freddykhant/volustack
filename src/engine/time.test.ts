import { describe, expect, it } from "vitest";
import { sessionMinutes } from "./time";

describe("sessionMinutes", () => {
  it("is just warmup for an empty session", () => {
    expect(sessionMinutes([])).toBe(8); // WARMUP_MIN
  });

  it("adds setup + per-set time per exercise", () => {
    // 8 warmup + (2 setup + 4·3) + (2 setup + 3·3) = 8 + 14 + 11 = 33
    expect(sessionMinutes([{ sets: 4 }, { sets: 3 }])).toBe(33);
  });
});
