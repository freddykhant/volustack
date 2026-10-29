import { describe, expect, it } from "vitest";

import { DEMO_MESSAGE, DEMO_TOTAL_MS, demoStateAt, type DemoPhase } from "./demo-script";

const ORDER: DemoPhase[] = ["idle", "typing", "busy", "moved", "proposed"];
const FINAL = { phase: "proposed", typed: DEMO_MESSAGE, done: true };

describe("demoStateAt", () => {
  it("finishes in under five seconds, so it needs no pause control", () => {
    expect(DEMO_TOTAL_MS).toBeLessThan(5000);
  });

  it("starts idle with nothing typed", () => {
    expect(demoStateAt(0)).toEqual({ phase: "idle", typed: "", done: false });
  });

  it("types the message one prefix at a time", () => {
    const { phase, typed } = demoStateAt(1000);
    expect(phase).toBe("typing");
    expect(typed.length).toBeGreaterThan(0);
    expect(typed.length).toBeLessThan(DEMO_MESSAGE.length);
    expect(DEMO_MESSAGE.startsWith(typed)).toBe(true);
  });

  it("never goes backwards through the phases", () => {
    let last = 0;
    const seen = new Set<DemoPhase>();
    for (let t = 0; t <= DEMO_TOTAL_MS + 500; t += 50) {
      const i = ORDER.indexOf(demoStateAt(t).phase);
      expect(i).toBeGreaterThanOrEqual(last);
      last = i;
      seen.add(demoStateAt(t).phase);
    }
    expect([...seen]).toEqual(ORDER);
  });

  it("holds the final state at and after the end", () => {
    expect(demoStateAt(DEMO_TOTAL_MS)).toEqual(FINAL);
    expect(demoStateAt(DEMO_TOTAL_MS + 60_000)).toEqual(FINAL);
  });

  it("jumps straight to the final state under reduced motion", () => {
    expect(demoStateAt(0, { reducedMotion: true })).toEqual(FINAL);
  });

  it("depends only on elapsed time, so a re-run effect can't double-play it", () => {
    expect(demoStateAt(1234)).toEqual(demoStateAt(1234));
  });

  it("treats negative time as the start", () => {
    expect(demoStateAt(-100)).toEqual(demoStateAt(0));
  });
});
