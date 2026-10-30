/**
 * The scroll story, as a pure function of scroll position. `pos` runs 0 → STORY_STEPS: the integer part is the
 * caption you're on (0 is the hero), the fraction is how far through it you've scrolled. Most beats flip at a
 * threshold and let a CSS transition do the motion; the typing and the M are scrubbed, so they follow your
 * thumb both ways.
 */

export const STORY_MESSAGE = "can't make Thursday, work trip";
export const STORY_STEPS = 6;

export type StoryState = {
  /** How much of the message is in the coach box. */
  typed: string;
  /** Thursday hatched out as busy. */
  busy: boolean;
  /** Upper B has slid across to Friday. */
  moved: boolean;
  /** The accept card is up. */
  proposed: boolean;
  /** The board has given way to the whole block. */
  zoomed: boolean;
  /** 0 → 1: how much of the M is drawn over the block's bars. */
  draw: number;
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

// Each beat lands a little after its caption arrives, so you read the line and then see it happen.
const TYPE_FROM = 1.05;
const TYPE_TO = 1.6;
const BUSY_AT = 2.1;
const MOVED_AT = 2.35;
const PROPOSED_AT = 3.1;
const ZOOM_AT = 4.1;
const DRAW_FROM = 5.05;
const DRAW_TO = 5.6;

export function storyStateAt(pos: number): StoryState {
  const chars = Math.round(clamp01((pos - TYPE_FROM) / (TYPE_TO - TYPE_FROM)) * STORY_MESSAGE.length);
  return {
    typed: STORY_MESSAGE.slice(0, chars),
    busy: pos >= BUSY_AT,
    moved: pos >= MOVED_AT,
    // The card makes way once the view pulls back to the block.
    proposed: pos >= PROPOSED_AT && pos < ZOOM_AT,
    zoomed: pos >= ZOOM_AT,
    draw: clamp01((pos - DRAW_FROM) / (DRAW_TO - DRAW_FROM)),
  };
}
