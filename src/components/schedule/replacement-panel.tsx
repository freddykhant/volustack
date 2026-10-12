"use client";

import { useState } from "react";
import { RescheduleDialog } from "~/components/block/reschedule-dialog";
import { api } from "~/trpc/react";
import type { ReplacementOptionView } from "~/views/schedule";

/** Ways to re-arrange a week in which a session is standing on blocked time. Renders
 * nothing when the engine has no options. Every change is the athlete's tap: an option
 * is applied on Accept, and a skip goes through the missed-session dialog first. */
export function ReplacementPanel({
  weekIndex,
  disabled,
  onAccept,
  onShow,
}: {
  weekIndex: number;
  /** A drag draft is open, or a save is in flight. */
  disabled: boolean;
  onAccept: (option: ReplacementOptionView) => void;
  onShow: (option: ReplacementOptionView) => void;
}) {
  const utils = api.useUtils();
  const query = api.schedule.getReplacementOptions.useQuery({ weekIndex });
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [skipping, setSkipping] = useState<string | null>(null);

  const options = query.data ?? [];
  // Dismissal is for exactly these options; a change in blocked time brings the panel back.
  const signature = JSON.stringify(
    options.map((o) => [o.id, o.placements, o.skipped.map((s) => s.sessionId)]),
  );
  if (options.length === 0 || dismissed === signature) return null;

  return (
    <div
      className="rounded-card border-accent bg-selection flex flex-col gap-3 border p-4"
      role="region"
      aria-label="Ways to re-arrange this week"
    >
      <div>
        <div className="text-accent text-[12px] font-medium">
          You&rsquo;ve blocked time this week
        </div>
        <div className="text-card-title text-fg mt-1">
          {options.length === 1
            ? "Here is how the week could go."
            : "Here are a few ways the week could go."}
        </div>
      </div>
      <ul className="flex flex-col gap-3">
        {options.map((o) => (
          <li
            key={o.id}
            className="rounded-control border-border-subtle bg-surface-raised flex flex-col gap-2 border p-3"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-nav text-fg font-medium">{o.title}</span>
              {o.lead ? (
                <span className="text-accent text-[12px] font-medium">
                  {o.judged ? "Coach’s pick" : "Suggested"}
                </span>
              ) : null}
            </div>
            {o.moves.length > 0 ? (
              <ul className="text-nav text-fg-soft flex flex-col gap-0.5">
                {o.moves.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            ) : null}
            {o.reasons.length > 0 ? (
              <ul className="text-fg-muted flex flex-col gap-0.5 text-[12px]">
                {o.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            ) : null}
            <div className="flex items-center gap-3">
              {o.kind === "skip" ? (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setSkipping(o.skipped[0]!.sessionId)}
                  className="rounded-control bg-accent text-nav hover:bg-accent-strong px-3 py-1.5 font-medium text-white transition-colors disabled:opacity-60"
                >
                  Skip {o.skipped[0]!.label}…
                </button>
              ) : (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onAccept(o)}
                  className="rounded-control bg-accent text-nav hover:bg-accent-strong px-3 py-1.5 font-medium text-white transition-colors disabled:opacity-60"
                >
                  Accept
                </button>
              )}
              {o.kind !== "skip" && o.moves.length > 0 ? (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onShow(o)}
                  className="text-nav text-fg-muted hover:text-fg transition-colors disabled:opacity-60"
                >
                  Show on board
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => setDismissed(signature)}
        className="text-nav text-fg-muted hover:text-fg self-start transition-colors"
      >
        I&rsquo;ll arrange it myself
      </button>
      {skipping !== null ? (
        <RescheduleDialog
          sessionId={skipping}
          open
          onClose={() => {
            setSkipping(null);
            // The session may now be missed: the week and its options are different.
            void utils.schedule.invalidate();
          }}
        />
      ) : null}
    </div>
  );
}
