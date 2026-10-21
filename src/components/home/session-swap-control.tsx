"use client";

import { useEffect, useRef, useState } from "react";
import { Check, RefreshCw, Undo2 } from "lucide-react";
import type { ReadinessLabel, SwapOption } from "~/views/types";
import { buttonClass } from "~/components/ui-kit/app-shell-kit";

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
      <div
        role="status"
        className="flex w-full animate-fade items-center justify-between gap-3 rounded-callout bg-sunken py-2 pr-2 pl-4 text-nav text-fg-soft sm:w-auto sm:flex-1"
      >
        <span className="inline-flex min-w-0 items-center gap-2">
          <Check className="size-4 shrink-0 text-fg-subtle" aria-hidden />
          <span>Swapped to {chosen.label} — still right on plan.</span>
        </span>
        <button
          ref={undoRef}
          type="button"
          onClick={() => {
            setChosen(null);
            setOpen(false);
          }}
          className={buttonClass("ghost", "sm")}
        >
          <Undo2 className="size-3.5" aria-hidden /> Undo
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
        className={buttonClass("secondary", "lg", "w-full sm:w-auto")}
      >
        <RefreshCw className="size-4" aria-hidden /> Swap session
      </button>
    );
  }

  return (
    <div className="flex w-full animate-rise flex-col gap-1.5" role="group" aria-label="Swap this session">
      {options.map((opt, i) => {
        const hint = fatigued && opt.intent === "easier";
        return (
          <button
            key={opt.id}
            ref={i === 0 ? firstOptionRef : undefined}
            type="button"
            onClick={() => setChosen(opt)}
            className="flex flex-col gap-0.5 rounded-control border border-border bg-surface-raised px-4 py-3 text-left shadow-control transition-[border-color,box-shadow] duration-200 hover:border-border-strong hover:shadow-card sm:flex-row sm:items-center sm:justify-between sm:gap-3"
          >
            <span className="text-list text-fg">{opt.label}</span>
            <span className="text-card-desc text-fg-muted tabular-nums">
              {hint ? "Fatigue high — consider easier · " : ""}
              {opt.summary}
            </span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => setOpen(false)}
        className={buttonClass("ghost", "sm", "mt-1 self-start")}
      >
        Cancel
      </button>
    </div>
  );
}
