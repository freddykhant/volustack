import { Check } from "lucide-react";
import type { ReactNode } from "react";

/** Shared building blocks for the landing sections. Server components; markup only. */

export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={"mx-auto w-full max-w-[1120px] px-4 sm:px-8" + (className ? " " + className : "")}>
      {children}
    </div>
  );
}

/** One landing block. Always labelled by its own heading so landmarks read sensibly. */
export function LandingSection({
  id,
  labelledBy,
  className,
  children,
}: {
  id?: string;
  labelledBy: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={"relative" + (className ? " " + className : "")}>
      {children}
    </section>
  );
}

export function Eyebrow({ children, onInk }: { children: ReactNode; onInk?: boolean }) {
  return <p className={"text-eyebrow font-medium " + (onInk ? "text-on-ink-subtle" : "text-fg-subtle")}>{children}</p>;
}

export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-[26px] items-center rounded-pill bg-sunken px-3 text-meta font-medium text-fg-soft">
      {children}
    </span>
  );
}

export function TickList({ items, onInk }: { items: string[]; onInk?: boolean }) {
  return (
    <ul className="mt-6 flex flex-col gap-2.5">
      {items.map((item) => (
        <li key={item} className={"flex items-start gap-2.5 text-body " + (onInk ? "text-on-ink-muted" : "text-fg-soft")}>
          <Check className={"mt-[3px] size-4 shrink-0 " + (onInk ? "text-on-ink" : "text-fg")} aria-hidden />
          {item}
        </li>
      ))}
    </ul>
  );
}

/** Text on one side, a product visual on the other; `flip` swaps sides on large screens. Stacks below `lg`. */
export function FeatureRow({
  tag,
  title,
  lede,
  ticks,
  visual,
  flip,
  headingId,
}: {
  tag: string;
  title: [string, string];
  lede: string;
  ticks: string[];
  visual: ReactNode;
  flip?: boolean;
  headingId: string;
}) {
  return (
    <div className="grid items-center gap-10 py-14 lg:grid-cols-[1fr_1.05fr] lg:gap-16 lg:py-[72px]">
      <div className={flip ? "lg:order-2" : undefined}>
        <Tag>{tag}</Tag>
        <h3 id={headingId} className="mt-4 text-landing-h3 text-balance text-fg">
          {title[0]}
          <br />
          {title[1]}
        </h3>
        <p className="mt-4 max-w-[46ch] text-body text-fg-muted sm:text-[17px] sm:leading-[26px]">{lede}</p>
        <TickList items={ticks} />
      </div>
      <div className={"min-w-0" + (flip ? " lg:order-1" : "")}>{visual}</div>
    </div>
  );
}
