import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { SessionPanel } from "~/components/block/session-panel";
import { WeeklyCheckInFlow } from "~/components/checkin/weekly-checkin-flow";
import { zoneFor } from "~/components/viz/zone";
import { requireCurrentBlock } from "~/server/mesocycle/current-block";

export default async function WeekDetail({ params }: { params: Promise<{ n: string }> }) {
  const { n } = await params;
  const block = await requireCurrentBlock();
  const week = block.weeks.find((w) => w.index === Number(n));
  if (!week) notFound();

  const optimal = week.cells.filter((c) => zoneFor(c.plannedSets, c) === "optimal").length;
  const nearMax = week.cells.filter((c) => zoneFor(c.plannedSets, c) === "max").length;

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-border-subtle px-6 py-5">
        <Link href="/app/block" className="mb-2 inline-flex items-center gap-1 text-nav text-fg-muted hover:text-fg">
          <ChevronLeft className="size-4" /> Block
        </Link>
        <h1 className="text-section text-fg">{week.isDeload ? "Deload week" : `Week ${week.index}`}</h1>
        <div className="mt-1 text-nav text-fg-muted">
          {week.sessions.length} sessions · {week.totalSets} total sets
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[12px]">
          <span className="rounded-pill bg-zone-optimal-soft px-2 py-0.5 text-fg-soft">{optimal} muscles optimal</span>
          {nearMax > 0 ? <span className="rounded-pill bg-zone-max-soft px-2 py-0.5 text-fg-soft">{nearMax} near MRV</span> : null}
        </div>
      </header>
      <div className="px-6 pt-6">
        <WeeklyCheckInFlow weekIndex={week.index} />
      </div>
      <div className="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-3">
        {week.sessions.map((s) => (
          <SessionPanel key={s.slotId} session={s} />
        ))}
      </div>
    </div>
  );
}
