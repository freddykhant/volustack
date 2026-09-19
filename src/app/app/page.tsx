import { nextSession } from "~/views/next-session";
import { rollUpStatus } from "~/components/viz/roll-up-status";
import { NextSessionCard } from "~/components/home/next-session-card";
import { TrainingStatusCard } from "~/components/home/training-status-card";
import { CoachCard } from "~/components/home/coach-card";
import { readinessState } from "~/components/viz/readiness-state";
import { ReadinessChip } from "~/components/readiness/readiness-chip";
import { mockReadiness } from "~/views/_fixtures/mock-readiness";
import { requireCurrentBlock } from "~/server/mesocycle/current-block";

export default async function NowHome() {
  const block = await requireCurrentBlock();
  const week =
    block.weeks.find((w) => w.index === block.currentWeekIndex) ?? block.weeks[0];
  const session = week ? nextSession(week) : undefined;
  const status = week ? rollUpStatus(week) : undefined;
  const readinessPoint =
    mockReadiness.series.find((p) => p.weekIndex === mockReadiness.currentWeekIndex) ??
    mockReadiness.series[mockReadiness.series.length - 1];
  const readinessLabel = readinessPoint ? readinessState(readinessPoint.form) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <div className="text-eyebrow font-medium text-fg-soft">{block.splitLabel}</div>
        <h1 className="mt-1 text-page-title text-fg">
          Week {block.currentWeekIndex} of {block.blockLengthWeeks}
        </h1>
        <p className="mt-1 text-card-desc text-fg-muted">{block.name}</p>
        <div className="mt-3">
          <ReadinessChip readiness={mockReadiness} />
        </div>
      </header>

      <NextSessionCard
        session={session}
        weekIndex={block.currentWeekIndex}
        readinessLabel={readinessLabel}
      />

      <div className="grid gap-6 md:grid-cols-2">
        {status ? <TrainingStatusCard status={status} /> : null}
        <CoachCard notes={block.coachNotes} />
      </div>
    </div>
  );
}
