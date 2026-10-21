"use client";

import { Button, Panel } from "~/components/ui-kit/app-shell-kit";
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
    <Panel
      padding="md"
      className="animate-rise flex flex-col gap-3"
      role="region"
      aria-label="Coach suggestion"
    >
      <div>
        <div className="text-eyebrow font-medium text-accent">
          Coach suggests
        </div>
        <div className="mt-1 text-card-title text-fg">{top.headline}</div>
      </div>
      {top.reasons.length > 0 ? (
        <ul className="flex flex-col gap-1 text-card-desc text-fg-muted">
          {top.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      ) : null}
      <div className="flex items-center gap-2">
        <Button
          variant="accent"
          size="sm"
          onClick={() => onAccept(top)}
          disabled={pending || dismiss.isPending}
        >
          Accept
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => dismiss.mutate({ weekIndex })}
          disabled={pending || dismiss.isPending}
        >
          Keep my layout
        </Button>
      </div>
    </Panel>
  );
}
