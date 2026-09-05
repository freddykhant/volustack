import { ReadinessHeadline } from "~/components/readiness/readiness-headline";
import { ReadinessChart } from "~/components/readiness/readiness-chart";
import { mockReadiness } from "~/views/_fixtures/mock-readiness";

export default function ReadinessPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <div className="text-eyebrow font-medium text-fg-soft">Recovery</div>
        <h1 className="mt-1 text-page-title text-fg">Readiness</h1>
        <p className="mt-1 text-card-desc text-fg-muted">
          Fitness, fatigue, and form across your block. In phase 2 this is driven by your wearables.
        </p>
      </header>
      <ReadinessHeadline readiness={mockReadiness} />
      <ReadinessChart readiness={mockReadiness} />
    </div>
  );
}
