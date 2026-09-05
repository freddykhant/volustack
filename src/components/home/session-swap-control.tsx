"use client";

import { useState } from "react";
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
  if (options.length === 0) return null;
  const fatigued = readinessLabel === "Fatigued" || readinessLabel === "Overreaching";

  if (chosen) {
    return (
      <div className="mt-4 flex items-center justify-between rounded-control border border-border-subtle px-3 py-2 text-nav text-fg-soft">
        <span>Swapped to {chosen.label} · still fits your plan</span>
        <button
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
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 inline-flex items-center gap-1.5 text-nav text-fg-muted transition-colors hover:text-fg"
      >
        <RefreshCw className="size-4" aria-hidden /> Swap session
      </button>
    );
  }

  return (
    <div className="mt-4 flex flex-col gap-2">
      {options.map((opt) => {
        const hint = fatigued && opt.intent === "easier";
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => setChosen(opt)}
            className="flex items-center justify-between gap-3 rounded-control border border-border-subtle px-3 py-2 text-left transition-colors hover:border-border"
          >
            <span className="text-nav text-fg">{opt.label}</span>
            <span className="text-[12px] text-fg-muted">
              {hint ? "Fatigue high — consider easier · " : ""}
              {opt.summary}
            </span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="self-start text-[12px] text-fg-subtle transition-colors hover:text-fg"
      >
        Cancel
      </button>
    </div>
  );
}
