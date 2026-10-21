"use client";

import { useEffect, useRef, useState } from "react";
import { Lightbulb } from "lucide-react";
import type { CueView } from "~/views/cues";

/** A small lightbulb by the day name when that day has a coach cue; opens the cue text. */
export function CueMarker({ cues }: { cues: CueView[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  // A press anywhere else closes the panel.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  if (cues.length === 0) return null;
  const titles = cues.map((c) => c.title).join("; ");

  return (
    <span
      ref={root}
      className="relative inline-flex"
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          setOpen(false);
          button.current?.focus();
        }
      }}
    >
      <button
        ref={button}
        type="button"
        aria-label={`Coach cue: ${titles}`}
        aria-expanded={open}
        title={titles}
        onClick={() => setOpen((o) => !o)}
        className="flex size-5 items-center justify-center rounded-pill transition-colors hover:bg-hover"
      >
        <Lightbulb className="size-3.5 text-fg-subtle" aria-hidden />
      </button>
      {open ? (
        <div className="absolute top-full left-0 z-10 mt-1 flex w-56 flex-col gap-2.5 rounded-control border border-border bg-surface-raised p-3 text-meta shadow-pop">
          {cues.map((c) => (
            <div key={c.id}>
              <div className="font-medium text-fg">{c.title}</div>
              <div className="text-fg-muted">{c.line}</div>
            </div>
          ))}
        </div>
      ) : null}
    </span>
  );
}
