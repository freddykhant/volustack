import { nextSession } from "~/views/next-session";
import { rollUpStatus } from "~/components/viz/roll-up-status";
import { NextSessionCard } from "~/components/home/next-session-card";
import { TrainingStatusCard } from "~/components/home/training-status-card";
import { CoachCard } from "~/components/home/coach-card";
import { mockMesocycle } from "~/views/_fixtures/mock-block";

export default function NowHome() {
  const block = mockMesocycle;
  const week =
    block.weeks.find((w) => w.index === block.currentWeekIndex) ?? block.weeks[0];
  const session = week ? nextSession(week) : undefined;
  const status = week ? rollUpStatus(week) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <div className="text-eyebrow font-medium text-fg-soft">{block.splitLabel}</div>
        <h1 className="mt-1 text-page-title text-fg">
          Week {block.currentWeekIndex} of {block.blockLengthWeeks}
        </h1>
        <p className="mt-1 text-card-desc text-fg-muted">{block.name}</p>
      </header>

      <NextSessionCard
        session={session}
        blockId={block.id}
        weekIndex={block.currentWeekIndex}
      />

      <div className="grid gap-6 md:grid-cols-2">
        {status ? <TrainingStatusCard status={status} /> : null}
        <CoachCard notes={block.coachNotes} />
      </div>
    </div>
  );
}
