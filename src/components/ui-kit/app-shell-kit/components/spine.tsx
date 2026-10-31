import type { ReactNode } from "react";

/** A vertical timeline: one 1px line with sky ring nodes. Use it for things that happened in order (the move log,
 *  week and block history). `SpineItem`s go inside. */
export function Spine({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <ol className={"relative" + (className ? " " + className : "")}>
      <span aria-hidden className="absolute top-2 bottom-2 left-[5px] w-px bg-border-strong" />
      {children}
    </ol>
  );
}

/** One entry. `lead` is the short label (a day, a date) set in sky above the content. With `aside`, the item
 *  becomes two columns on large screens, and the lead and content pin while the aside (a mock, a chart) scrolls. */
export function SpineItem({
  lead,
  aside,
  labelledBy,
  className,
  children,
}: {
  lead: ReactNode;
  aside?: ReactNode;
  labelledBy?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <li
      aria-labelledby={labelledBy}
      className={
        "relative pb-10 pl-8 last:pb-0 " +
        (aside ? "grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16 lg:pb-28 lg:pl-10 " : "") +
        (className ?? "")
      }
    >
      <span
        aria-hidden
        className="absolute top-[5px] left-0 size-[11px] rounded-full border-2 border-sky bg-canvas"
      />
      <div className={aside ? "lg:sticky lg:top-24 lg:self-start" : undefined}>
        <div className="text-nav font-semibold text-sky-strong tabular-nums">{lead}</div>
        <div className="mt-1.5">{children}</div>
      </div>
      {aside ? <div className="min-w-0">{aside}</div> : null}
    </li>
  );
}
