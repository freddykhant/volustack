import { nextSession } from "~/views/next-session";
import { rollUpStatus } from "~/components/viz/roll-up-status";
import { readinessState } from "~/components/viz/readiness-state";
import { NowHome } from "~/components/home/now-home";
import { requireCurrentBlock, readiness } from "~/server/mesocycle/current-block";

export default async function NowPage() {
  const block = await requireCurrentBlock();
  const week =
    block.weeks.find((w) => w.index === block.currentWeekIndex) ?? block.weeks[0];
  const session = week ? nextSession(week) : undefined;
  const status = week ? rollUpStatus(week) : undefined;
  const readinessData = await readiness();
  const readinessPoint =
    readinessData.series.find((p) => p.weekIndex === readinessData.currentWeekIndex) ??
    readinessData.series[readinessData.series.length - 1];
  const readinessLabel = readinessPoint ? readinessState(readinessPoint) : undefined;

  return (
    <NowHome
      splitLabel={block.splitLabel}
      blockName={block.name}
      weekIndex={block.currentWeekIndex}
      blockLengthWeeks={block.blockLengthWeeks}
      session={session}
      status={status}
      coachNotes={block.coachNotes}
      readiness={readinessData}
      readinessLabel={readinessLabel}
    />
  );
}
