/**
 * The hero's one-shot story, as a pure function of elapsed time: the visitor's line types into the
 * coach box, Thursday turns busy, Upper B lands on Friday, and the accept card asks. Each phase change
 * is a ≤300ms CSS transition in the view; the gaps here are holds. Elapsed-time driven (not a chain of
 * timeouts), so re-running the effect can't double-play it, and the whole thing stays under 5s.
 */

export const DEMO_MESSAGE = "can't make Thursday, work trip";

export type DemoPhase = "idle" | "typing" | "busy" | "moved" | "proposed";
export type DemoState = { phase: DemoPhase; typed: string; done: boolean };

const IDLE_MS = 400;
const MS_PER_CHAR = 45;
const TYPING_END = IDLE_MS + DEMO_MESSAGE.length * MS_PER_CHAR;
const BUSY_AT = TYPING_END + 250;
const MOVED_AT = BUSY_AT + 650;
const PROPOSED_AT = MOVED_AT + 650;

/** When the last change has finished settling (the accept card's 320ms rise). */
export const DEMO_TOTAL_MS = PROPOSED_AT + 320;

export function demoStateAt(elapsedMs: number, opts?: { reducedMotion?: boolean }): DemoState {
  const t = opts?.reducedMotion ? DEMO_TOTAL_MS : Math.max(0, elapsedMs);
  if (t < IDLE_MS) return { phase: "idle", typed: "", done: false };
  if (t < BUSY_AT) {
    const chars = Math.min(DEMO_MESSAGE.length, Math.floor((t - IDLE_MS) / MS_PER_CHAR));
    return { phase: "typing", typed: DEMO_MESSAGE.slice(0, chars), done: false };
  }
  const phase: DemoPhase = t < MOVED_AT ? "busy" : t < PROPOSED_AT ? "moved" : "proposed";
  return { phase, typed: DEMO_MESSAGE, done: t >= DEMO_TOTAL_MS };
}
