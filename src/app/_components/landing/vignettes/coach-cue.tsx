import { Utensils } from "lucide-react";

/** A coach cue as it appears on the home page. Static. */
export function CoachCueVignette() {
  return (
    <div className="mt-5">
      <p className="sr-only">
        Example cue: with Lower B and a 10k on the same weekend, Mesodapt suggests 1 to 1.2 grams of carbs per kilo
        in the meal before Saturday&apos;s lift.
      </p>
      <div aria-hidden className="flex items-start gap-3 rounded-callout bg-sunken p-3.5">
        <span className="flex size-[30px] shrink-0 items-center justify-center rounded-control bg-surface-raised shadow-control">
          <Utensils className="size-4 text-fg-muted" />
        </span>
        <div>
          <div className="text-list text-fg">Two big days in a row</div>
          <p className="mt-0.5 text-card-desc text-fg-muted tabular-nums">
            Lower B, then a 10k. Get 1–1.2 g/kg of carbs in the meal before Saturday&apos;s lift.
          </p>
        </div>
      </div>
    </div>
  );
}
