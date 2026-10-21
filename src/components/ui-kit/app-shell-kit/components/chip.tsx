import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type Tone = "neutral" | "accent" | "rest" | "building" | "optimal" | "max";

const TONE: Record<Tone, string> = {
  neutral: "bg-sunken text-fg-muted",
  accent: "bg-selection text-accent",
  // Zone tones are for DATA states only (a session's zone, a muscle's status) — never chrome.
  rest: "bg-zone-rest-soft text-fg-soft",
  building: "bg-zone-building-soft text-fg-soft",
  optimal: "bg-zone-optimal-soft text-fg-soft",
  max: "bg-zone-max-soft text-fg-soft",
};

const DOT: Partial<Record<Tone, string>> = {
  accent: "bg-accent",
  rest: "bg-zone-rest",
  building: "bg-zone-building",
  optimal: "bg-zone-optimal",
  max: "bg-zone-max",
};

/** Small pill label: status, tag, "Next up". Zone tones carry a full-strength dot so the hue reads at chip size. */
export function Chip({
  tone = "neutral",
  icon: Icon,
  dot,
  children,
  className,
}: {
  tone?: Tone;
  icon?: LucideIcon;
  /** Leading colour dot (defaults on for zone tones). */
  dot?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const showDot = dot ?? (tone !== "neutral" && tone !== "accent");
  return (
    <span
      className={
        "inline-flex h-6 items-center gap-1.5 rounded-pill px-2.5 text-[12px] leading-none font-medium whitespace-nowrap " +
        TONE[tone] +
        (className ? " " + className : "")
      }
    >
      {Icon ? <Icon className="size-3.5" aria-hidden /> : showDot && DOT[tone] ? <span className={"size-1.5 rounded-full " + DOT[tone]} aria-hidden /> : null}
      {children}
    </span>
  );
}
