import Link from "next/link";
import { ArrowRight, Dumbbell } from "lucide-react";
import type { SessionView } from "~/views/types";

export function NextSessionCard({
  session,
  blockId,
  weekIndex,
}: {
  session: SessionView | undefined;
  blockId: string;
  weekIndex: number;
}) {
  if (!session) {
    return (
      <div className="rounded-card border border-border bg-surface p-6">
        <div className="text-eyebrow font-medium text-fg-soft">Next session</div>
        <div className="mt-2 text-card-title text-fg-muted">No session scheduled</div>
      </div>
    );
  }
  const exercises = session.prescriptions.map((p) => p.exerciseName);
  const shown = exercises.slice(0, 4).join(" · ");
  const more = exercises.length > 4 ? ` · +${exercises.length - 4}` : "";
  return (
    <div className="rounded-card border border-border bg-surface p-6">
      <div className="text-eyebrow font-medium text-fg-soft">Next session</div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-section text-fg">{session.label}</span>
        {session.dayTag ? <span className="text-nav text-fg-subtle">{session.dayTag}</span> : null}
      </div>
      <div className="mt-1 text-card-desc text-fg-muted">
        {session.prescriptions.length} exercises · ~{session.estimatedMinutes} min
      </div>
      <div className="mt-3 text-nav text-fg-subtle">
        {shown}
        {more}
      </div>
      <Link
        href={`/app/block/${blockId}/week/${weekIndex}`}
        className="mt-5 inline-flex items-center gap-2 rounded-control bg-accent px-4 py-2 text-nav font-medium text-white transition-colors hover:bg-accent-strong"
      >
        <Dumbbell className="size-4" aria-hidden />
        Start session
        <ArrowRight className="size-4" aria-hidden />
      </Link>
    </div>
  );
}
