import Link from "next/link";
import { AlertTriangle, ArrowRight, Info, TrendingUp, type LucideIcon } from "lucide-react";
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
    <div className="rounded-card border border-border bg-surface p-6">
      <div className="text-eyebrow font-medium text-fg-soft">Coach</div>
      <ul className="mt-3 flex flex-col gap-3">
        {notes.map((note) => {
          const { icon: Icon, text, iconColor } = TONE[note.tone];
          return (
            <li key={note.id} className={`flex items-start gap-2.5 text-card-desc ${text}`}>
              <Icon className={`mt-0.5 size-4 shrink-0 ${iconColor}`} aria-hidden />
              <span>{note.text}</span>
            </li>
          );
        })}
      </ul>
      <Link
        href="/app/coach"
        className="mt-4 inline-flex items-center gap-1 text-nav text-fg-muted transition-colors hover:text-fg"
      >
        View all
        <ArrowRight className="size-4" aria-hidden />
      </Link>
    </div>
  );
}
