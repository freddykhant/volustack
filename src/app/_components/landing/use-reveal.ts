"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * True once the element has been 35% on screen, and it stays true (nothing replays on scroll-back).
 * Under reduced motion it is true straight away, so every vignette shows its final state.
 */
export function useReveal<T extends Element>(): { ref: RefObject<T | null>; revealed: boolean } {
  const ref = useRef<T>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setRevealed(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setRevealed(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return { ref, revealed };
}
