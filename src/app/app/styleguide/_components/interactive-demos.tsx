"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button, Segmented } from "~/components/ui-kit/app-shell-kit";

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
