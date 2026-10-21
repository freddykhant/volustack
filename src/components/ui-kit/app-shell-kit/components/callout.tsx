import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type Props = { icon?: LucideIcon; children: ReactNode };

/** Info banner: soft blue wash, 14px radius, optional accent icon. `role="note"`. Place directly under PageHeader. */
export function Callout({ icon: Icon, children }: Props) {
  return (
    <div className="flex gap-3 rounded-callout bg-callout px-4 py-3.5 text-body text-fg-soft" role="note">
      {Icon ? <Icon className="mt-[3px] size-4 shrink-0 text-accent" aria-hidden /> : null}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
