"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw, Undo2 } from "lucide-react";
import type { ReadinessLabel, SwapOption } from "~/views/types";

export function SessionSwapControl({
  options,
  readinessLabel,
}: {
  options: SwapOption[];
  readinessLabel?: ReadinessLabel;
}) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<SwapOption | null>(null);
  // Keep keyboard focus with the control as it swaps between entry / options /
  // confirmation button trees — without this, focus drops to <body> on each
  // transition. The guard skips the initial render so we never steal focus.
  const interacted = useRef(false);
  const entryRef = useRef<HTMLButtonElement>(null);
  const firstOptionRef = useRef<HTMLButtonElement>(null);
  const undoRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!interacted.current) return;
    if (chosen) undoRef.current?.focus();
    else if (open) firstOptionRef.current?.focus();
    else entryRef.current?.focus();
  }, [open, chosen]);

  if (options.length === 0) return null;
  const fatigued = readinessLabel === "Fatigued" || readinessLabel === "Overreaching";

  if (chosen) {
    return (
      <div className="mt-4 flex items-center justify-between rounded-control border border-border-subtle px-3 py-2 text-nav text-fg-soft">
        <span>Swapped to {chosen.label} — still right on plan.</span>
        <button
          ref={undoRef}
          type="button"
          onClick={() => {
            setChosen(null);
            setOpen(false);
          }}
          className="inline-flex items-center gap-1 text-fg-muted transition-colors hover:text-fg"
        >
          <Undo2 className="size-4" aria-hidden /> Undo
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        ref={entryRef}
        type="button"
        onClick={() => {
          interacted.current = true;
          setOpen(true);
        }}
        className="mt-4 inline-flex items-center gap-2 rounded-control border border-border-subtle px-3 py-2 text-nav text-fg-soft transition-colors hover:border-border hover:text-fg"
      >
        <RefreshCw className="size-4" aria-hidden /> Swap session
      </button>
    );
  }

  return (
    <div className="mt-4 flex flex-col gap-2" role="group" aria-label="Swap this session">
      {options.map((opt, i) => {
        const hint = fatigued && opt.intent === "easier";
        return (
          <button
            key={opt.id}
            ref={i === 0 ? firstOptionRef : undefined}
            type="button"
            onClick={() => setChosen(opt)}
            className="flex items-center justify-between gap-3 rounded-control border border-border-subtle px-3 py-2 text-left transition-colors hover:border-border"
          >
            <span className="text-nav text-fg">{opt.label}</span>
            <span className="text-nav text-fg-muted">
              {hint ? "Fatigue high — consider easier · " : ""}
              {opt.summary}
            </span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="self-start text-nav text-fg-subtle transition-colors hover:text-fg"
      >
        Cancel
      </button>
    </div>
  );
}
