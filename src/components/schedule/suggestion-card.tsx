"use client";

import { api } from "~/trpc/react";
import type { MoveSuggestionView } from "~/views/schedule";

/** The coach's one suggested tweak to the saved layout. Renders nothing when the
 * engine has nothing worth saying. Accepting is the athlete's call. */
export function SuggestionCard({
  weekIndex,
  pending,
  onAccept,
}: {
  weekIndex: number;
  pending: boolean;
  onAccept: (s: MoveSuggestionView) => void;
}) {
  const utils = api.useUtils();
  const suggestions = api.schedule.getSuggestions.useQuery({ weekIndex });
  const dismiss = api.schedule.dismissSuggestion.useMutation({
    onSuccess: () => void utils.schedule.getSuggestions.invalidate(),
  });
  const top = suggestions.data?.[0];
  if (!top) return null;

  return (
    <div
      className="rounded-card border-accent bg-selection flex flex-col gap-3 border p-4"
      role="region"
      aria-label="Coach suggestion"
    >
      <div>
        <div className="text-accent text-[12px] font-medium">
          Coach suggests
        </div>
        <div className="text-card-title text-fg mt-1">{top.headline}</div>
      </div>
      {top.reasons.length > 0 ? (
        <ul className="text-nav text-fg-soft flex flex-col gap-1">
          {top.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      ) : null}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onAccept(top)}
          disabled={pending || dismiss.isPending}
          className="rounded-control bg-accent text-nav hover:bg-accent-strong px-4 py-2 font-medium text-white transition-colors disabled:opacity-60"
        >
          Accept
        </button>
        <button
          type="button"
          onClick={() => dismiss.mutate({ weekIndex })}
          disabled={pending || dismiss.isPending}
          className="text-nav text-fg-muted hover:text-fg transition-colors disabled:opacity-60"
        >
          Keep my layout
        </button>
      </div>
    </div>
  );
}
