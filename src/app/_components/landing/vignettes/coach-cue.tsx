import { Utensils } from "lucide-react";

import { DEMO_CUE } from "../demo-cue";

/** A coach cue as it appears on the home page, worded by the app's own cue view. Static. */
export function CoachCueVignette() {
  return (
    <div>
      <p className="sr-only">
        Example cue: {DEMO_CUE.title}. {DEMO_CUE.line}
      </p>
      <div aria-hidden className="flex items-start gap-3 rounded-callout bg-sunken p-3.5">
        <span className="flex size-[30px] shrink-0 items-center justify-center rounded-control bg-surface-raised shadow-control">
          <Utensils className="size-4 text-fg-muted" />
        </span>
        <div>
          <div className="text-list text-fg">{DEMO_CUE.title}</div>
          <p className="mt-0.5 text-card-desc text-fg-muted tabular-nums">{DEMO_CUE.line}</p>
        </div>
      </div>
    </div>
  );
}
