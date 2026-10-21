import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Chip, PageHeader } from "~/components/ui-kit/app-shell-kit";
import { SessionPanel } from "~/components/block/session-panel";
import { WeeklyCheckInFlow } from "~/components/checkin/weekly-checkin-flow";
import { ScheduleBoard } from "~/components/schedule/schedule-board";
import { zoneFor } from "~/components/viz/zone";
import { requireCurrentBlock } from "~/server/mesocycle/current-block";

export default async function WeekDetail({
  params,
}: {
  params: Promise<{ n: string }>;
}) {
  const { n } = await params;
  const block = await requireCurrentBlock();
  const week = block.weeks.find((w) => w.index === Number(n));
  if (!week) notFound();

  const optimal = week.cells.filter(
    (c) => zoneFor(c.plannedSets, c) === "optimal",
  ).length;
  const nearMax = week.cells.filter(
    (c) => zoneFor(c.plannedSets, c) === "max",
  ).length;

  return (
    <div className="mx-auto w-full max-w-[800px] px-6 pt-10 pb-20 md:px-10">
      <Link
        href="/app/block"
        className="mb-4 inline-flex items-center gap-1 text-nav text-fg-muted transition-colors hover:text-fg"
      >
        <ChevronLeft className="size-4" aria-hidden /> Block
      </Link>
      <PageHeader
        eyebrow={week.isDeload ? "Deload" : "Block week"}
        title={week.isDeload ? "Deload week" : `Week ${week.index}`}
        description={
          <span className="tabular-nums">
            {week.sessions.length} sessions · {week.totalSets} total sets
          </span>
        }
      />
      <div className="mt-4 flex flex-wrap gap-2">
        <Chip tone="optimal">
          <span className="tabular-nums">{`${optimal} muscles optimal`}</span>
        </Chip>
        {nearMax > 0 ? (
          <Chip tone="max">
            <span className="tabular-nums">{`${nearMax} near MRV`}</span>
          </Chip>
        ) : null}
      </div>
      <div className="mt-8 flex flex-col gap-8">
        <WeeklyCheckInFlow weekIndex={week.index} />
        <ScheduleBoard weekIndex={week.index} />
        <div className="grid gap-4 md:grid-cols-2">
          {week.sessions.map((s) => (
            <SessionPanel key={s.slotId} session={s} />
          ))}
        </div>
      </div>
    </div>
  );
}
