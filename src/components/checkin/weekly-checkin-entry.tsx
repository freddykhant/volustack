"use client";

import { api } from "~/trpc/react";

/** End-of-week entry point. Renders only when the week is resolved and no terminal
 * progression decision exists yet. Accent CTA (scarce). onOpen wired in Task 9. */
export function WeeklyCheckInEntry({ weekIndex, onOpen }: { weekIndex: number; onOpen?: () => void }) {
  const q = api.checkin.getWeeklyCheckIn.useQuery({ weekIndex });
  const view = q.data;
  if (!view) return null;

  if (view.status === "APPLIED") {
    return (
      <div className="rounded-card border border-border-subtle bg-surface px-5 py-4 text-nav text-fg-muted">
        Week {weekIndex} progression applied to Week {weekIndex + 1} ✓
      </div>
    );
  }
  if (view.status !== "READY" && view.status !== "SUBMITTED") return null;

  const submitted = view.status === "SUBMITTED";
  return (
    <div className="rounded-card border border-border bg-surface-raised p-6">
      <div className="text-card-title text-fg">Week {weekIndex} wrapped — how’d it land?</div>
      <p className="mt-1 text-card-desc text-fg-muted">
        {submitted
          ? "Your proposal for next week is ready."
          : "A quick read on recovery and joints sets up next week’s volume."}
      </p>
      <button
        type="button"
        // eslint-disable-next-line @typescript-eslint/no-empty-function -- placeholder no-op; wired in Task 9
        onClick={onOpen ?? (() => {})}
        className="mt-4 inline-flex items-center gap-2 rounded-control bg-accent px-5 py-3 text-list font-medium text-white transition-colors hover:bg-accent-strong"
      >
        {submitted ? "See proposal" : "Check in"}
      </button>
    </div>
  );
}
