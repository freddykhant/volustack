import Link from "next/link";
import type { LucideIcon } from "lucide-react";

type Props = {
  variant: "filled" | "ghost";
  icon: LucideIcon;
  title: string;
  description: string;
  href: string;
};

/** Whole-card link. `filled` = tile on a Panel surface (icon chip on top, lifts on hover); `ghost` = list row (icon left, hover wash).
 *  Place filled tiles in `grid gap-4 md:grid-cols-2`. */
export function Card({ variant, icon: Icon, title, description, href }: Props) {
  if (variant === "filled") {
    return (
      <Link
        href={href}
        className="group flex flex-col rounded-card border border-border bg-surface p-5 shadow-card transition-[box-shadow,transform] duration-300 hover:-translate-y-px hover:shadow-card-hover"
      >
        <span className="flex size-9 items-center justify-center rounded-control bg-sunken text-fg-muted transition-colors group-hover:text-accent">
          <Icon className="size-[18px]" aria-hidden />
        </span>
        <div className="mt-4 text-card-title text-fg">{title}</div>
        <div className="mt-1 text-card-desc text-fg-muted">{description}</div>
      </Link>
    );
  }
  return (
    <Link href={href} className="group -mx-2 flex items-start gap-3 rounded-control px-2 py-2 transition-colors hover:bg-hover">
      <Icon className="mt-0.5 size-5 shrink-0 text-fg-subtle transition-colors group-hover:text-accent" aria-hidden />
      <div className="min-w-0">
        <div className="text-list text-fg">{title}</div>
        <div className="text-card-desc text-fg-muted">{description}</div>
      </div>
    </Link>
  );
}
