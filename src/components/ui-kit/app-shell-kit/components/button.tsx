import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "accent" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary: "bg-ink text-on-ink hover:bg-ink-hover",
  accent: "bg-accent text-on-accent hover:bg-accent-strong",
  secondary: "bg-surface-raised text-fg border border-border shadow-control hover:border-border-strong",
  ghost: "text-fg-muted hover:bg-hover hover:text-fg",
  danger: "bg-surface-raised text-danger border border-border hover:bg-hover",
};

const SIZE: Record<Size, string> = {
  sm: "h-8 px-3 gap-1.5 text-meta font-medium",
  md: "h-9 px-4 gap-2 text-nav",
  lg: "h-11 px-5 gap-2 text-body font-medium",
};

const ICON: Record<Size, string> = { sm: "size-3.5", md: "size-4", lg: "size-4" };

/** Shared class string, for the rare element that can't be a <Button> (e.g. a form's <label>). */
export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return (
    "inline-flex shrink-0 select-none items-center justify-center rounded-pill font-medium whitespace-nowrap " +
    "transition-[background-color,border-color,color,box-shadow,transform] duration-200 active:scale-[0.98] " +
    "disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45 " +
    VARIANT[variant] +
    " " +
    SIZE[size] +
    (extra ? " " + extra : "")
  );
}

type Common = {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  /** Icon after the label (e.g. ArrowRight on a forward CTA). */
  trailingIcon?: LucideIcon;
  /** Shows a spinner, disables the button, keeps its width. */
  loading?: boolean;
  children?: ReactNode;
  className?: string;
};

function Inner({ icon: Icon, trailingIcon: Trailing, loading, size = "md", children }: Common) {
  return (
    <>
      {loading ? (
        <span
          aria-hidden
          className={ICON[size] + " animate-spin rounded-full border-[1.5px] border-current border-r-transparent"}
        />
      ) : Icon ? (
        <Icon className={ICON[size]} aria-hidden />
      ) : null}
      {children}
      {Trailing ? <Trailing className={ICON[size]} aria-hidden /> : null}
    </>
  );
}

/** The one button. `primary` = ink pill (one per view, the main action); `accent` = blue pill (accept-gate confirms only);
 *  `secondary` = white pill with hairline; `ghost` = text button; `danger` = destructive confirm. Pills everywhere. */
export function Button({
  variant,
  size,
  icon,
  trailingIcon,
  loading,
  className,
  children,
  disabled,
  ...rest
}: Common & Omit<ComponentProps<"button">, keyof Common>) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled ?? loading}
      aria-busy={loading ? true : undefined}
      className={buttonClass(variant, size, className)}
    >
      <Inner icon={icon} trailingIcon={trailingIcon} loading={loading} size={size}>
        {children}
      </Inner>
    </button>
  );
}

/** Same look as Button, for navigation. */
export function ButtonLink({
  variant,
  size,
  icon,
  trailingIcon,
  className,
  children,
  ...rest
}: Common & Omit<ComponentProps<typeof Link>, keyof Common>) {
  return (
    <Link {...rest} className={buttonClass(variant, size, className)}>
      <Inner icon={icon} trailingIcon={trailingIcon} size={size}>
        {children}
      </Inner>
    </Link>
  );
}

/** Square icon-only button (close, more, sign out). Always pass an aria-label. */
export function IconButton({
  icon: Icon,
  className,
  ...rest
}: { icon: LucideIcon; "aria-label": string } & Omit<ComponentProps<"button">, "children">) {
  return (
    <button
      type="button"
      {...rest}
      className={
        "inline-flex size-8 shrink-0 items-center justify-center rounded-pill text-fg-subtle transition-colors hover:bg-hover hover:text-fg disabled:opacity-45" +
        (className ? " " + className : "")
      }
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}
