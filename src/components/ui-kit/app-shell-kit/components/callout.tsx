import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type Props = { icon?: LucideIcon; children: ReactNode };

/** Info banner with a 3px accent-strong left bar on a faint blue fill. Place directly under PageHeader. `role="note"`. */
export function Callout({ icon: Icon, children }: Props) {
  return (
    <div
      className="flex gap-3 rounded-callout bg-callout p-5 text-body text-fg"
      style={{ borderLeft: "3px solid var(--color-accent-strong)" }}
      role="note"
    >
      {Icon ? <Icon className="mt-0.5 size-5 shrink-0 text-accent-strong" aria-hidden /> : null}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
