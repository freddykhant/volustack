import { PageHeader } from "~/components/ui-kit/app-shell-kit";
import { ReadinessHeadline } from "~/components/readiness/readiness-headline";
import { ReadinessChart } from "~/components/readiness/readiness-chart";
import type { ReadinessView } from "~/views/types";

/** The Readiness page's layout. Pure presentation: the route fetches the engine's view. */
export function ReadinessScreen({ readiness }: { readiness: ReadinessView }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Recovery"
        title="Readiness"
        description="Fitness, fatigue, and form from your logged training. In phase 2 your wearables deepen it."
      />
      <div className="animate-rise [animation-delay:60ms]">
        <ReadinessHeadline readiness={readiness} />
      </div>
      <div className="animate-rise [animation-delay:120ms]">
        <ReadinessChart readiness={readiness} />
      </div>
    </div>
  );
}
