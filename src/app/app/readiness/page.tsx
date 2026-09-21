import { ReadinessHeadline } from "~/components/readiness/readiness-headline";
import { ReadinessChart } from "~/components/readiness/readiness-chart";
import { readiness } from "~/server/mesocycle/current-block";

export default async function ReadinessPage() {
  const data = await readiness();
  return (
    <div className="flex flex-col gap-6">
      <header>
        <div className="text-eyebrow font-medium text-fg-soft">Recovery</div>
        <h1 className="mt-1 text-page-title text-fg">Readiness</h1>
        <p className="mt-1 text-card-desc text-fg-muted">
          Fitness, fatigue, and form from your logged training. In phase 2 your wearables deepen it.
        </p>
      </header>
      <ReadinessHeadline readiness={data} />
      <ReadinessChart readiness={data} />
    </div>
  );
}
