import Link from "next/link";
import { AlertTriangle, ArrowRight, Info, TrendingUp, type LucideIcon } from "lucide-react";
import { Panel } from "~/components/ui-kit/app-shell-kit";
import type { CoachNote } from "~/views/types";

/** Coach tone → icon + text emphasis. Distinction is carried by icon SHAPE
 * (accessible, non-color) + text shade, staying monochrome: the zone-* hues
 * are data-only and the accent is reserved for interactive state, so neither
 * belongs on coach copy. */
const TONE: Record<CoachNote["tone"], { icon: LucideIcon; text: string; iconColor: string }> = {
  info: { icon: Info, text: "text-fg-muted", iconColor: "text-fg-subtle" },
  caution: { icon: AlertTriangle, text: "text-fg", iconColor: "text-fg-soft" },
  positive: { icon: TrendingUp, text: "text-fg-soft", iconColor: "text-fg-soft" },
};

export function CoachCard({ notes }: { notes: CoachNote[] }) {
  if (notes.length === 0) return null;
  return (
    <Panel as="section" aria-label="Coach" className="flex flex-col">
      <div className="text-eyebrow font-medium text-fg-subtle">Coach</div>
      <ul className="mt-3 flex flex-col gap-3">
        {notes.map((note) => {
          const { icon: Icon, text, iconColor } = TONE[note.tone];
          return (
            <li key={note.id} className={`flex items-start gap-3 text-card-desc ${text}`}>
              <span className="flex size-6 shrink-0 items-center justify-center rounded-pill bg-sunken">
                <Icon className={`size-3.5 ${iconColor}`} aria-hidden />
              </span>
              <span className="pt-0.5">{note.text}</span>
            </li>
          );
        })}
      </ul>
      <Link
        href="/app/coach"
        className="group mt-auto inline-flex items-center gap-1 self-start pt-5 text-nav text-fg-muted transition-colors hover:text-fg"
      >
        View all
        <ArrowRight
          className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
          aria-hidden
        />
      </Link>
    </Panel>
  );
}
