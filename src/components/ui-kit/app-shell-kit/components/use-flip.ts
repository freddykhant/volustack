"use client";

import { useLayoutEffect, useRef } from "react";

// Where each keyed element was when it last unmounted. A session that moves days unmounts from one column and
// mounts in another within the same commit, so its old box is still fresh when the new one arrives.
const departed = new Map<string, { rect: DOMRect; at: number }>();
const FRESH_MS = 1000;

/**
 * The hop: when an element with this `id` leaves one place and appears in another (a session moved to a new day),
 * it slides from its old box to its new one instead of jumping. 700ms on --ease-out, the one long motion in the
 * app (DESIGN.md → Motion). Under reduced motion it just appears. Only cross-mount moves animate, so scrolling or
 * re-rendering in place never triggers it.
 */
export function useFlip<T extends HTMLElement>(id: string) {
  const ref = useRef<T>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const prev = departed.get(id);
    departed.delete(id);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prev && performance.now() - prev.at < FRESH_MS && !reduce) {
      const next = el.getBoundingClientRect();
      const dx = prev.rect.left - next.left;
      const dy = prev.rect.top - next.top;
      if (dx || dy) {
        el.animate(
          [
            { transform: `translate(${dx}px, ${dy}px)`, boxShadow: "var(--shadow-pop)" },
            { transform: "none", boxShadow: "var(--shadow-card)" },
          ],
          { duration: 700, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
        );
      }
    }
    return () => {
      departed.set(id, { rect: el.getBoundingClientRect(), at: performance.now() });
    };
  }, [id]);

  return ref;
}
