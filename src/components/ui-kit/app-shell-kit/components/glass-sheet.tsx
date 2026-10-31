import type { ComponentProps, ReactNode } from "react";

/** The navy glass sheet: where the language model speaks. Two slow prism fields and grain sit behind its content;
 *  put `GlassCard`s on it. One per screen, never for anything the engine computed (DESIGN.md → Prism & glass).
 *  `size="page"` is the landing's full-bleed section; `"panel"` is an in-app card-sized sheet. */
export function GlassSheet({
  size = "panel",
  as: Tag = "section",
  className,
  children,
  ...rest
}: {
  size?: "panel" | "page";
  as?: "section" | "div" | "aside";
  className?: string;
  children: ReactNode;
} & Omit<ComponentProps<"section">, "children" | "ref">) {
  const page = size === "page";
  return (
    <Tag
      {...rest}
      className={
        "relative isolate overflow-hidden bg-night text-on-ink " +
        (page ? "rounded-t-sheet-xl" : "rounded-sheet p-5 sm:p-6") +
        (className ? " " + className : "")
      }
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div
          className={
            "bg-prism absolute opacity-55 " +
            (page ? "-top-56 -right-48 size-[520px] sm:size-[760px]" : "-top-32 -right-24 size-[360px]")
          }
        />
        <div
          className={
            "bg-prism absolute opacity-35 [animation-direction:reverse] " +
            (page ? "top-[38%] -left-40 size-[420px] sm:size-[620px]" : "-bottom-40 -left-28 size-[300px]")
          }
        />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-[radial-gradient(60%_80%_at_70%_100%,color-mix(in_srgb,var(--color-pink)_30%,transparent),transparent_70%)]" />
        <div className="bg-grain absolute inset-0 opacity-[0.18]" />
      </div>
      {children}
    </Tag>
  );
}

/** Frosted glass on a `GlassSheet`. `tone="model"` takes the turning prism edge (one per sheet: where the model
 *  worked); `tone="live"` takes the pink edge (the athlete's step). */
export function GlassCard({
  tone = "plain",
  as: Tag = "div",
  className,
  children,
}: {
  tone?: "plain" | "model" | "live";
  as?: "div" | "li" | "article";
  className?: string;
  children: ReactNode;
}) {
  const edge = { plain: "border-ink-border", model: "border-prism", live: "border-accent-on-ink/60" }[tone];
  return (
    <Tag className={"glass-ink relative rounded-card border p-5 sm:p-6 " + edge + (className ? " " + className : "")}>
      {children}
    </Tag>
  );
}
