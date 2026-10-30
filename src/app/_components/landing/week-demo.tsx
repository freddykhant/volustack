"use client";

import { ArrowRight, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Chip, buttonClass } from "~/components/ui-kit/app-shell-kit";
import { DEMO_MESSAGE, DEMO_TOTAL_MS, demoStateAt, type DemoPhase } from "./demo-script";

/** Fired by the closing CTA's "See how it adapts ↑" link to play the hero again. */
export const REPLAY_EVENT = "landing:replay";

const DAYS = [
  { short: "M", day: "Mon", date: 10 },
  { short: "T", day: "Tue", date: 11 },
  { short: "W", day: "Wed", date: 12 },
  { short: "T", day: "Thu", date: 13 },
  { short: "F", day: "Fri", date: 14 },
  { short: "S", day: "Sat", date: 15 },
  { short: "S", day: "Sun", date: 16 },
] as const;

// `short` is the phone label: a 7-day board leaves ~28px per session card at 360px.
const PLANNED: Record<string, { name: string; short: string; sets: number }> = {
  Mon: { name: "Upper A", short: "Up A", sets: 18 },
  Tue: { name: "Lower A", short: "Lo A", sets: 16 },
  Sat: { name: "Lower B", short: "Lo B", sets: 15 },
};

const at = (phase: DemoPhase, from: DemoPhase) => {
  const order: DemoPhase[] = ["idle", "typing", "busy", "moved", "proposed"];
  return order.indexOf(phase) >= order.indexOf(from);
};

/**
 * The hero's scripted week: a static replica of the board, coach box and accept-gate. It plays once,
 * only when the tab is visible and the demo is in view, then holds its final state. Reduced motion
 * shows the final state at once. Purely presentational: nothing here talks to the engine.
 */
export function WeekDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const [elapsed, setElapsed] = useState(0);
  const [reduced, setReduced] = useState(false);
  const [run, setRun] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const onReplay = () => {
      setElapsed(0);
      setRun((r) => r + 1);
    };
    window.addEventListener(REPLAY_EVENT, onReplay);
    return () => window.removeEventListener(REPLAY_EVENT, onReplay);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let start: number | null = null;
    let inView = false;

    const tick = (now: number) => {
      start ??= now;
      const e = now - start;
      setElapsed(e);
      raf = e < DEMO_TOTAL_MS ? requestAnimationFrame(tick) : -1;
    };
    // Starts once: raf stays non-zero after the first frame, so later visibility/intersection events are no-ops.
    const begin = () => {
      if (raf !== 0 || !inView || document.visibilityState !== "visible") return;
      raf = requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        inView = entry?.isIntersecting ?? false;
        begin();
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    document.addEventListener("visibilitychange", begin);
    return () => {
      if (raf > 0) cancelAnimationFrame(raf);
      io.disconnect();
      document.removeEventListener("visibilitychange", begin);
    };
  }, [run]);

  const { phase, typed, done } = demoStateAt(elapsed, { reducedMotion: reduced });
  const busy = at(phase, "busy");
  const moved = at(phase, "moved");
  const proposed = at(phase, "proposed");

  return (
    <div ref={ref} className="relative">
      <p className="sr-only">
        Demo: you tell Mesodapt you can&apos;t make Thursday, and it proposes moving Upper B to Friday. Nothing
        changes until you accept.
      </p>
      <div
        aria-hidden
        className="rounded-card border border-border bg-surface p-3 shadow-card sm:p-4"
      >
        {/* Coach box */}
        <div className="flex h-10 items-center gap-2 rounded-pill bg-sunken pr-1.5 pl-4 text-body">
          <span className={"min-w-0 flex-1 truncate " + (typed ? "text-fg" : "text-fg-subtle")}>
            {typed || "What changed this week?"}
            {phase === "typing" && typed.length < DEMO_MESSAGE.length ? (
              <span className="ml-px inline-block h-4 w-px translate-y-[3px] bg-fg" />
            ) : null}
          </span>
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ink text-on-ink">
            <ArrowRight className="size-3.5" />
          </span>
        </div>

        <div className="mt-3.5 mb-2.5 flex items-center justify-between gap-2 px-0.5">
          <span className="text-nav font-semibold text-fg">Week 3 of 6</span>
          {/* re-review: colour scheme. Mirrors readiness-chip.tsx (Productive = building). */}
          <Chip tone="building">Form · Productive</Chip>
        </div>

        {/* Week board */}
        <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
          {DAYS.map((d) => {
            const planned = PLANNED[d.day];
            const isThu = d.day === "Thu";
            const isFri = d.day === "Fri";
            return (
              <div key={d.day} className="min-w-0">
                <div className="truncate px-0.5 pb-1.5 text-[11px] leading-4 text-fg-subtle tabular-nums">
                  <span className="font-semibold text-fg-soft">
                    <span className="sm:hidden">{d.short}</span>
                    <span className="hidden sm:inline">{d.day}</span>
                  </span>
                  <span className="hidden md:inline"> {d.date}</span>
                </div>
                <div
                  className={
                    "flex min-h-[76px] flex-col gap-1 rounded-tile p-0.5 transition-colors duration-300 sm:p-1 " +
                    (isThu && busy
                      ? "bg-[repeating-linear-gradient(135deg,var(--color-press)_0_5px,transparent_5px_10px)]"
                      : "bg-sunken")
                  }
                >
                  {isThu ? (
                    <>
                      <span
                        className={
                          "text-[11px] leading-4 font-medium text-fg-muted transition-opacity duration-300 " +
                          (busy ? "opacity-100" : "opacity-0")
                        }
                      >
                        Busy
                      </span>
                      <Session
                        name="Upper B"
                        short="Up B"
                        sets={17}
                        variant={busy ? "ghost" : "planned"}
                      />
                    </>
                  ) : null}
                  {isFri ? (
                    <div
                      className={
                        "transition-[opacity,transform] duration-300 ease-[var(--ease-out)] " +
                        (moved ? "translate-y-0 opacity-100" : "translate-y-1.5 opacity-0")
                      }
                    >
                      <Session name="Upper B" short="Up B" sets={17} variant="moved" />
                    </div>
                  ) : null}
                  {planned ? <Session name={planned.name} short={planned.short} sets={planned.sets} variant="planned" /> : null}
                  {d.day === "Sat" ? (
                    <span className="rounded-[7px] bg-press px-1 py-1 text-[11px] sm:px-1.5 leading-[14px] text-fg-soft">
                      Run<span className="hidden sm:inline"> · easy</span>
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        {/* Accept-gate. Always laid out so its arrival doesn't shift the page. */}
        <div
          className={
            "mt-3.5 rounded-[16px] bg-surface-raised p-4 shadow-pop transition-[opacity,transform] duration-300 ease-[var(--ease-out)] " +
            (proposed ? "translate-y-0 opacity-100" : "translate-y-1.5 opacity-0")
          }
        >
          <div className="text-card-title text-fg">Move Upper B to Friday?</div>
          <p className="mt-1 text-card-desc text-fg-muted">
            Thursday&apos;s busy, but Friday still gives your upper body 48 hours to recover and keeps chest in its
            optimal zone
          </p>
          <div className="mt-3 flex justify-end gap-1.5">
            <span className={buttonClass("ghost", "sm")}>Not now</span>
            {/* re-review: colour scheme (accent = the accept-gate confirm) */}
            <span className={buttonClass("accent", "sm")}>Accept move</span>
          </div>
        </div>
      </div>

      <div className="mt-2 flex h-8 justify-end">
        {done && !reduced ? (
          <button
            type="button"
            onClick={() => {
              setElapsed(0);
              setRun((r) => r + 1);
            }}
            className={buttonClass("ghost", "sm") + " animate-fade"}
          >
            <RotateCcw className="size-3.5" aria-hidden />
            Replay
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Session({
  name,
  short,
  sets,
  variant,
}: {
  name: string;
  short: string;
  sets: number;
  variant: "planned" | "ghost" | "moved";
}) {
  const look = {
    planned: "border-border bg-surface-raised text-fg",
    ghost: "border-dashed border-border-strong bg-transparent text-fg-subtle",
    // re-review: colour scheme (the moved session carries the one live blue)
    moved: "border-accent bg-surface-raised text-fg ring-2 ring-accent/15",
  }[variant];
  return (
    <div
      className={
        "rounded-[7px] border px-1 py-1 text-[11px] leading-[14px] font-semibold break-normal hyphens-none transition-colors duration-300 sm:px-1.5 sm:text-[12px] " +
        look
      }
    >
      <span className="sm:hidden">{short}</span>
      <span className="hidden sm:inline">{name}</span>
      <span
        className={
          "hidden font-normal tabular-nums sm:block " + (variant === "ghost" ? "text-fg-subtle" : "text-fg-muted")
        }
      >
        {sets} sets
      </span>
    </div>
  );
}
