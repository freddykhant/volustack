"use client";

import { useState } from "react";
import { RescheduleDialog } from "~/components/block/reschedule-dialog";
import { Button, Panel } from "~/components/ui-kit/app-shell-kit";
import { api } from "~/trpc/react";
import type { ReplacementOptionView } from "~/views/schedule";

/** Ways to re-arrange a week in which a session is standing on blocked time. Renders
 * nothing when the engine has no options, and one line while the first ones for a
 * stranded week are on their way. Every change is the athlete's tap: an option
 * is applied on Accept, and a skip goes through the missed-session dialog first. */
export function ReplacementPanel({
  weekIndex,
  disabled,
  stranded,
  dismissed,
  onDismiss,
  onAccept,
  onShow,
}: {
  weekIndex: number;
  /** A drag draft is open, or a save is in flight. */
  disabled: boolean;
  /** The saved week has a session standing on blocked time, so options are due. */
  stranded: boolean;
  /** Signature of the options the athlete chose to arrange themselves; kept by the board. */
  dismissed: string | null;
  onDismiss: (signature: string) => void;
  onAccept: (option: ReplacementOptionView) => void;
  onShow: (option: ReplacementOptionView) => void;
}) {
  const utils = api.useUtils();
  const query = api.schedule.getReplacementOptions.useQuery({ weekIndex });
  const [skipping, setSkipping] = useState<string | null>(null);

  const options = query.data ?? [];
  // Dismissal matches these exact options, so it outlasts a refetch that returns the same
  // ones and lapses when blocked time changes them.
  const signature = JSON.stringify(
    options.map((o) => [
      o.id,
      Object.entries(o.layout).sort(([a], [b]) => a.localeCompare(b)),
      o.skipped.map((s) => s.sessionId),
    ]),
  );
  if (options.length === 0 && stranded && query.isFetching) {
    return (
      <p className="text-card-desc text-fg-muted" role="status">
        Working out how the week could go…
      </p>
    );
  }
  if (options.length === 0 || dismissed === signature) return null;

  return (
    <Panel
      padding="md"
      className="animate-rise flex flex-col gap-4"
      role="region"
      aria-label="Ways to re-arrange this week"
    >
      <div>
        <div className="text-eyebrow font-medium text-accent">
          A session is on time you&rsquo;ve blocked
        </div>
        <div className="mt-1 text-card-title text-fg">
          {options.length === 1
            ? "Here is how the week could go."
            : "Here are a few ways the week could go."}
        </div>
      </div>
      <ul className="flex flex-col gap-2">
        {options.map((o) => (
          <li
            key={o.id}
            className="flex flex-col gap-2 rounded-callout bg-sunken p-4"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-list text-fg">{o.title}</span>
              {o.lead ? (
                <span className="text-meta font-medium text-accent">
                  {o.judged ? "Coach’s pick" : "Suggested"}
                </span>
              ) : null}
            </div>
            {o.kind !== "skip" && o.moves.length > 0 ? (
              <ul className="flex flex-col gap-0.5 text-card-desc text-fg-soft">
                {o.moves.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            ) : null}
            {o.reasons.length > 0 ? (
              <ul className="flex flex-col gap-0.5 text-meta text-fg-muted">
                {o.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            ) : null}
            <div className="mt-1 flex items-center gap-2">
              {o.kind === "skip" ? (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={disabled || query.isFetching}
                  onClick={() => setSkipping(o.skipped[0]!.sessionId)}
                >
                  Skip {o.skipped[0]!.label}…
                </Button>
              ) : (
                <Button
                  variant="accent"
                  size="sm"
                  aria-label={`Accept: ${o.title}`}
                  disabled={disabled || query.isFetching}
                  onClick={() => onAccept(o)}
                >
                  Accept
                </Button>
              )}
              {o.kind !== "skip" && o.moves.length > 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Show on board: ${o.title}`}
                  disabled={disabled || query.isFetching}
                  onClick={() => onShow(o)}
                >
                  Show on board
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onDismiss(signature)}
        className="self-start"
      >
        I&rsquo;ll arrange it myself
      </Button>
      {skipping !== null ? (
        <RescheduleDialog
          sessionId={skipping}
          open
          title="Skip this session?"
          onClose={() => {
            setSkipping(null);
            // The session may now be missed: the week and its options are different.
            void utils.schedule.invalidate();
          }}
        />
      ) : null}
    </Panel>
  );
}
