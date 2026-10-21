"use client";

export type SegmentedOption<T extends string> = { value: T; label: string };

/** Luma-style segmented control: a sunken pill track with a white raised thumb on the selected option. Use for 2–4 mutually exclusive views (Week / Month, One-a-day / AM·PM). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  "aria-label": ariaLabel,
  size = "md",
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  "aria-label": string;
  size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex rounded-pill bg-sunken p-[3px]">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={
              "rounded-pill font-medium transition-[background-color,color,box-shadow] duration-200 " +
              (size === "sm" ? "h-7 px-3 text-meta " : "h-8 px-3.5 text-nav ") +
              (on ? "bg-surface-raised text-fg shadow-control" : "text-fg-muted hover:text-fg")
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
