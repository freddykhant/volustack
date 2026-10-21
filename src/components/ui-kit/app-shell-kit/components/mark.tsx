/**
 * The Mesodapt mark: one stroke through a training block. It climbs a step each week, drops for the
 * deload, runs flat, then climbs again from higher up, which draws an M. Drawn on Lucide's 24 grid so it
 * sits with the nav icons; it inherits `currentColor` and is never the accent. See DESIGN.md → Brand.
 */
export function Mark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M4 19.25V11.75L10 6.75V15.25H14V9.75L20 4.75V19.25" />
    </svg>
  );
}
