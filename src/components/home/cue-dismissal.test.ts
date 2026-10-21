import { describe, expect, it } from "vitest";
import { CUE_DISMISSED_KEY, readDismissed, writeDismissed } from "./cue-dismissal";

const store = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};

describe("cue dismissal", () => {
  it("round-trips ids", () => {
    const s = store();
    writeDismissed(s, new Set(["2026-10-20:heavy_lower:L"]), "2026-10-20");
    expect(readDismissed(s, "2026-10-20")).toEqual(new Set(["2026-10-20:heavy_lower:L"]));
  });
  it("prunes ids whose date is more than 3 days before today", () => {
    const s = store({ [CUE_DISMISSED_KEY]: JSON.stringify(["2026-10-16:heavy_lower:L", "2026-10-17:heavy_lower:L"]) });
    expect(readDismissed(s, "2026-10-20")).toEqual(new Set(["2026-10-17:heavy_lower:L"]));
  });
  it("survives storage that is missing, throws, or holds junk", () => {
    expect(readDismissed(null, "2026-10-20").size).toBe(0);
    const throwing = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
    expect(readDismissed(throwing, "2026-10-20").size).toBe(0);
    expect(() => writeDismissed(throwing, new Set(["x"]), "2026-10-20")).not.toThrow();
    expect(readDismissed(store({ [CUE_DISMISSED_KEY]: "{not json" }), "2026-10-20").size).toBe(0);
    expect(readDismissed(store({ [CUE_DISMISSED_KEY]: JSON.stringify({ a: 1 }) }), "2026-10-20").size).toBe(0);
  });
});
