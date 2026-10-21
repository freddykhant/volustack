import type { ComponentProps, ReactNode } from "react";

/** The surface every card-like block sits on: white-ish fill, hairline, soft wide shadow, 20px radius.
 *  `interactive` adds the hover lift for whole-card click targets. `padding` defaults to 20px. */
export function Panel({
  interactive,
  padding = "md",
  className,
  children,
  as: Tag = "div",
  ...rest
}: {
  interactive?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
  as?: "div" | "section" | "article";
  children: ReactNode;
  className?: string;
} & Omit<ComponentProps<"div">, "children" | "ref">) {
  const pad = { none: "", sm: "p-4", md: "p-5", lg: "p-6" }[padding];
  return (
    <Tag
      {...rest}
      className={
        "rounded-card border border-border bg-surface shadow-card " +
        (interactive ? "transition-[box-shadow,border-color,transform] duration-300 hover:-translate-y-px hover:shadow-card-hover " : "") +
        pad +
        (className ? " " + className : "")
      }
    >
      {children}
    </Tag>
  );
}

/** Loading placeholder. Size and shape with utilities: `<Skeleton className="h-4 w-32" />`, `rounded-card` for a card. */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={"skeleton block" + (className ? " " + className : "")} />;
}
