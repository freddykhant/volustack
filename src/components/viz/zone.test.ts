import { describe, expect, it } from "vitest";
import { zoneFor } from "./zone";

const lm = { mev: 8, mav: 14, mrv: 22 };

describe("zoneFor", () => {
  it("returns rest below MEV (incl. zero)", () => {
    expect(zoneFor(0, lm)).toBe("rest");
    expect(zoneFor(7, lm)).toBe("rest");
  });
  it("returns building at exactly MEV up to just below MAV", () => {
    expect(zoneFor(8, lm)).toBe("building");
    expect(zoneFor(13, lm)).toBe("building");
  });
  it("returns optimal at exactly MAV up to just below MRV", () => {
    expect(zoneFor(14, lm)).toBe("optimal");
    expect(zoneFor(21, lm)).toBe("optimal");
  });
  it("returns max at exactly MRV and above", () => {
    expect(zoneFor(22, lm)).toBe("max");
    expect(zoneFor(30, lm)).toBe("max");
  });
});
