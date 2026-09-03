import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { SessionCard } from "~/components/block/session-card";
import { zoneFor } from "~/components/viz/zone";
import { mockMesocycle } from "~/views/_fixtures/mock-block";

export default async function WeekDetail({ params }: { params: Promise<{ blockId: string; n: string }> }) {
  const { blockId, n } = await params;
  if (blockId !== mockMesocycle.id) notFound();
  const week = mockMesocycle.weeks.find((w) => w.index === Number(n));
  if (!week) notFound();

  const optimal = week.cells.filter((c) => zoneFor(c.plannedSets, c) === "optimal").length;
  const nearMax = week.cells.filter((c) => zoneFor(c.plannedSets, c) === "max").length;

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-border-subtle px-6 py-5">
        <Link href={`/app/block/${mockMesocycle.id}`} className="mb-2 inline-flex items-center gap-1 text-nav text-fg-muted hover:text-fg">
          <ChevronLeft className="size-4" /> Block
        </Link>
        <h1 className="text-section text-fg">
          {week.isDeload ? "Deload week" : `Week ${week.index}`} · {week.sessions.length} sessions · {week.totalSets} total sets
        </h1>
        <div className="mt-2 flex flex-wrap gap-2 text-[12px]">
          <span className="rounded-pill bg-zone-optimal-soft px-2 py-0.5 text-fg-soft">{optimal} muscles optimal</span>
          {nearMax > 0 ? <span className="rounded-pill bg-zone-max-soft px-2 py-0.5 text-fg-soft">{nearMax} near MRV</span> : null}
        </div>
      </header>
      <div className="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-3">
        {week.sessions.map((s) => (
          <SessionCard key={s.slotId} session={s} />
        ))}
      </div>
    </div>
  );
}
