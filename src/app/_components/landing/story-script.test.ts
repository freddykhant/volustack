import { describe, expect, it } from "vitest";

import { STORY_MESSAGE, STORY_STEPS, storyStateAt } from "./story-script";

describe("storyStateAt", () => {
  it("shows an untouched week at the top of the page", () => {
    expect(storyStateAt(0)).toEqual({
      typed: "",
      busy: false,
      moved: false,
      proposed: false,
      zoomed: false,
      draw: 0,
    });
  });

  it("types the message as a prefix while you scroll through the first caption", () => {
    const { typed } = storyStateAt(1.3);
    expect(typed.length).toBeGreaterThan(0);
    expect(typed.length).toBeLessThan(STORY_MESSAGE.length);
    expect(STORY_MESSAGE.startsWith(typed)).toBe(true);
    expect(storyStateAt(1.9).typed).toBe(STORY_MESSAGE);
  });

  it("marks Thursday busy before Upper B moves, and moves it before asking", () => {
    let seenBusy = -1;
    let seenMoved = -1;
    let seenProposed = -1;
    for (let p = 0; p <= STORY_STEPS; p += 0.01) {
      const s = storyStateAt(p);
      if (s.busy && seenBusy < 0) seenBusy = p;
      if (s.moved && seenMoved < 0) seenMoved = p;
      if (s.proposed && seenProposed < 0) seenProposed = p;
      // Upper B never lands on Friday without Thursday being busy.
      if (s.moved) expect(s.busy).toBe(true);
    }
    expect(seenBusy).toBeGreaterThan(0);
    expect(seenMoved).toBeGreaterThan(seenBusy);
    expect(seenProposed).toBeGreaterThan(seenMoved);
  });

  it("clears the accept card once the view pulls back to the block", () => {
    expect(storyStateAt(3.5).proposed).toBe(true);
    expect(storyStateAt(4.5)).toMatchObject({ proposed: false, zoomed: true });
  });

  it("scrubs the M both ways and finishes it before the story ends", () => {
    expect(storyStateAt(4.9).draw).toBe(0);
    const mid = storyStateAt(5.3).draw;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(storyStateAt(5.9).draw).toBe(1);
    expect(storyStateAt(STORY_STEPS + 3).draw).toBe(1);
  });

  it("depends only on position, so scrolling back up replays it in reverse", () => {
    for (const p of [0.4, 1.2, 2.2, 3.4, 4.4, 5.2]) expect(storyStateAt(p)).toEqual(storyStateAt(p));
    expect(storyStateAt(-2)).toEqual(storyStateAt(0));
  });
});
