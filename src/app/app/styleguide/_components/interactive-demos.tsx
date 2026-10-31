"use client";

import { useEffect, useState } from "react";
import { ArrowRight, RotateCcw } from "lucide-react";
import { Button, Segmented, useFlip } from "~/components/ui-kit/app-shell-kit";

type View = "week" | "month" | "block";
type Mode = "one" | "ampm";

/** Both Segmented sizes, wired to state so the thumb can be tried. */
export function SegmentedDemo() {
  const [view, setView] = useState<View>("week");
  const [mode, setMode] = useState<Mode>("one");
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-4">
        <Segmented
          aria-label="Calendar view"
          value={view}
          onChange={setView}
          options={[
            { value: "week", label: "Week" },
            { value: "month", label: "Month" },
            { value: "block", label: "Block" },
          ]}
        />
        <span className="text-meta text-fg-muted">
          md · showing <span className="text-fg">{view}</span>
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Segmented
          size="sm"
          aria-label="Schedule mode"
          value={mode}
          onChange={setMode}
          options={[
            { value: "one", label: "One a day" },
            { value: "ampm", label: "AM · PM" },
          ]}
        />
        <span className="text-meta text-fg-muted">sm</span>
      </div>
    </div>
  );
}

/** Replays the entrance animations so the curve can be judged by eye. */
export function MotionDemo() {
  const [run, setRun] = useState(0);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div key={"rise" + run} className="animate-rise rounded-control bg-sunken px-4 py-5">
          <div className="text-nav text-fg">animate-rise</div>
          <div className="text-meta text-fg-muted">320ms · 6px up + fade</div>
        </div>
        <div key={"fade" + run} className="animate-fade rounded-control bg-sunken px-4 py-5">
          <div className="text-nav text-fg">animate-fade</div>
          <div className="text-meta text-fg-muted">240ms · opacity</div>
        </div>
      </div>
      <div>
        <Button variant="secondary" size="sm" icon={RotateCcw} onClick={() => setRun((n) => n + 1)}>
          Replay
        </Button>
      </div>
    </div>
  );
}

type Theme = "new" | "classic";

/** Flips the whole app between the current palette and the Luma-era one (`.theme-classic` on <html>), the
 *  same switch an A/B test would use. Resets when you leave the page. */
export function ThemeDemo() {
  const [theme, setTheme] = useState<Theme>("new");
  useEffect(() => {
    document.documentElement.classList.toggle("theme-classic", theme === "classic");
    return () => document.documentElement.classList.remove("theme-classic");
  }, [theme]);
  return (
    <Segmented
      size="sm"
      aria-label="Palette"
      value={theme}
      onChange={setTheme}
      options={[
        { value: "new", label: "Current" },
        { value: "classic", label: "Classic" },
      ]}
    />
  );
}

const DAYS = ["Thu", "Fri"] as const;

/** The hop: a session leaves one day and lands on another. `useFlip` slides it across instead of letting it jump. */
export function HopDemo() {
  const [day, setDay] = useState<(typeof DAYS)[number]>("Thu");
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2">
        {DAYS.map((d) => (
          <div key={d} className="flex min-h-[92px] flex-col gap-1.5 rounded-tile bg-sunken p-1.5">
            <span className="px-0.5 text-meta font-semibold text-fg-soft">{d}</span>
            {day === d ? <HopCard moved={d === "Fri"} /> : null}
          </div>
        ))}
      </div>
      <div>
        <Button
          variant="secondary"
          size="sm"
          icon={day === "Thu" ? ArrowRight : RotateCcw}
          onClick={() => setDay((d) => (d === "Thu" ? "Fri" : "Thu"))}
        >
          {day === "Thu" ? "Accept move" : "Put it back"}
        </Button>
      </div>
    </div>
  );
}

function HopCard({ moved }: { moved: boolean }) {
  const ref = useFlip<HTMLDivElement>("styleguide-upper-b");
  return (
    <div
      ref={ref}
      className={
        "rounded-[7px] border bg-surface-raised px-2 py-1.5 text-[12px] leading-[14px] font-semibold text-fg " +
        (moved ? "border-accent shadow-card ring-[3px] ring-accent/15" : "border-border")
      }
    >
      Upper B<span className="block font-normal text-fg-muted tabular-nums">17 sets</span>
    </div>
  );
}

/** The coach box: it wears the prism edge only while the model is reading what you sent. */
export function CoachBoxDemo() {
  const [reading, setReading] = useState(false);
  useEffect(() => {
    if (!reading) return;
    const t = setTimeout(() => setReading(false), 2200);
    return () => clearTimeout(t);
  }, [reading]);
  return (
    <div className="flex flex-col gap-3">
      <div
        className={
          "flex h-11 items-center gap-2 rounded-pill border bg-surface-raised pr-1.5 pl-4 text-body shadow-control " +
          (reading ? "border-prism" : "border-border")
        }
      >
        <span className="min-w-0 flex-1 truncate text-fg">can&apos;t make Thursday, work trip</span>
        <button
          type="button"
          aria-label="Send"
          onClick={() => setReading(true)}
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-on-ink transition-colors hover:bg-ink-hover"
        >
          <ArrowRight className="size-4" aria-hidden />
        </button>
      </div>
      <p className="text-meta text-fg-muted">{reading ? "The model is reading it…" : "Press send to see the reading state."}</p>
    </div>
  );
}
