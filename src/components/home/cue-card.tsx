"use client";

import { useEffect, useState } from "react";
import { Lightbulb, X } from "lucide-react";
import { Panel } from "~/components/ui-kit/app-shell-kit";
import { CUE_FOOTER, type CueView, type CueWhen } from "~/views/cues";
import { readDismissed, writeDismissed } from "./cue-dismissal";

const storage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

/** Today's and tomorrow's coach cues. Renders nothing when there are none to show. */
export function CueCard({ days }: { days: { date: string; when: CueWhen; cues: CueView[] }[] }) {
  const today = days.find((d) => d.when === "today")?.date ?? days[0]?.date ?? "";
  // Read after mount: the server has no storage. Until then nothing renders, so a cue the
  // athlete dismissed never flashes back.
  const [dismissed, setDismissed] = useState<Set<string> | null>(null);
  useEffect(() => setDismissed(readDismissed(storage(), today)), [today]);

  if (dismissed === null) return null;
  const shown = days.flatMap((d) => d.cues).filter((c) => !dismissed.has(c.id));
  if (shown.length === 0) return null;

  function dismiss(id: string) {
    const next = new Set(dismissed ?? []).add(id);
    setDismissed(next);
    writeDismissed(storage(), next, today);
  }

  return (
    <Panel as="section" aria-label="Coach cues">
      <div className="text-eyebrow font-medium text-fg-subtle">Coach</div>
      <ul className="mt-3 flex flex-col gap-4">
        {shown.map((c) => (
          <li key={c.id} className="flex items-start gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-pill bg-sunken">
              <Lightbulb className="size-3.5 text-fg-subtle" aria-hidden />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="text-meta font-medium text-fg-subtle">{c.when === "today" ? "Today" : "Tomorrow"}</div>
              <div className="text-card-desc text-fg">{c.title}</div>
              <div className="text-card-desc text-fg-muted">{c.line}</div>
            </div>
            <button
              type="button"
              aria-label={`Dismiss: ${c.title}`}
              onClick={() => dismiss(c.id)}
              className="rounded-control p-1 text-fg-subtle transition-colors hover:text-fg"
            >
              <X className="size-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      {shown.some((c) => c.hasNumber) ? <p className="mt-4 text-meta text-fg-subtle">{CUE_FOOTER}</p> : null}
    </Panel>
  );
}
