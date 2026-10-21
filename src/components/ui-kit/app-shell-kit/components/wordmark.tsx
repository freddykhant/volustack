import { Dumbbell } from "lucide-react";

/** The Mesodapt wordmark: ink tile with the Dumbbell mark + the name. One component for nav, landing and onboarding. */
export function Wordmark({ size = "md" }: { size?: "md" | "lg" }) {
  const lg = size === "lg";
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        className={
          "flex items-center justify-center rounded-tile bg-ink text-on-ink " + (lg ? "size-8" : "size-7")
        }
      >
        <Dumbbell className={lg ? "size-[18px]" : "size-4"} aria-hidden />
      </span>
      <span className={(lg ? "text-section" : "text-card-title") + " text-fg"}>Mesodapt</span>
    </span>
  );
}
