import Link from "next/link";
import type { LucideIcon } from "lucide-react";

type Props = {
  variant: "filled" | "ghost";
  icon: LucideIcon;
  title: string;
  description: string;
  href: string;
};

/** Whole-card click target. `filled` = hero grid tile (icon on top, surface bg, border); `ghost` = list row (icon left, transparent). Icon + title shift to accent on hover. Always place in a 2-column grid (`grid gap-6 md:grid-cols-2`) inside the 756px content column. */
export function Card({ variant, icon: Icon, title, description, href }: Props) {
  if (variant === "filled") {
    return (
      <Link
        href={href}
        className="group flex flex-col rounded-card border border-border bg-surface p-6 transition-colors"
      >
        <Icon className="size-6 text-fg-muted transition-colors group-hover:text-accent" />
        <div className="mt-3 text-card-title text-fg transition-colors group-hover:text-accent">
          {title}
        </div>
        <div className="mt-1 text-card-desc text-fg-muted">{description}</div>
      </Link>
    );
  }
  return (
    <Link href={href} className="group flex items-start gap-3 rounded-card p-1 transition-colors">
      <Icon className="size-6 shrink-0 text-fg-muted transition-colors group-hover:text-accent" />
      <div className="min-w-0">
        <div className="text-card-title text-fg transition-colors group-hover:text-accent">
          {title}
        </div>
        <div className="text-card-desc text-fg-muted">{description}</div>
      </div>
    </Link>
  );
}
