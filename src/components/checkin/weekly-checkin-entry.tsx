"use client";

import { Check } from "lucide-react";
import { api } from "~/trpc/react";
import { Button, Panel } from "~/components/ui-kit/app-shell-kit";

/** End-of-week entry point. Renders only when the week is resolved and no terminal
 * progression decision exists yet. Accent CTA (scarce). `onOpen` is supplied by
 * WeeklyCheckInFlow, which mounts this as its internal trigger. */
export function WeeklyCheckInEntry({ weekIndex, onOpen }: { weekIndex: number; onOpen: () => void }) {
  const q = api.checkin.getWeeklyCheckIn.useQuery({ weekIndex });
  const view = q.data;
  if (!view) return null;

  if (view.status === "APPLIED") {
    return (
      <Panel padding="sm" className="flex items-center gap-2.5 px-5 text-card-desc text-fg-muted">
        <Check className="size-4 shrink-0" aria-hidden />
        <span className="tabular-nums">Week {weekIndex} progression applied to Week {weekIndex + 1}</span>
      </Panel>
    );
  }
  if (view.status !== "READY" && view.status !== "SUBMITTED") return null;

  const submitted = view.status === "SUBMITTED";
  return (
    <Panel padding="lg" className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        <div className="text-card-title text-fg">Week {weekIndex} wrapped — how’d it land?</div>
        <p className="mt-1 text-card-desc text-fg-muted">
          {submitted
            ? "Your proposal for next week is ready."
            : "A quick read on recovery and joints sets up next week’s volume."}
        </p>
      </div>
      <Button variant="accent" onClick={onOpen}>
        {submitted ? "See proposal" : "Check in"}
      </Button>
    </Panel>
  );
}
