/** Weekly volume as bars: the block's climb, the deload and where you are now. Sky bars, the deload in the rest
 *  hue, the current week in the pink live signal. Bars grow in once on mount. `summary` is the screen-reader
 *  version of the chart; say what it shows, not that it's a chart. */
export function VolumeBars({
  weeks,
  current,
  summary,
  className,
}: {
  weeks: { label: string; sets: number; deload?: boolean }[];
  /** Index into `weeks` of the week the athlete is in. */
  current?: number;
  summary: string;
  className?: string;
}) {
  const max = Math.max(1, ...weeks.map((w) => w.sets));
  return (
    <figure className={"flex flex-col gap-2" + (className ? " " + className : "")}>
      <figcaption className="sr-only">{summary}</figcaption>
      <div aria-hidden className="flex h-28 items-end gap-1.5 sm:gap-2">
        {weeks.map((w, i) => {
          const now = i === current;
          return (
            <div key={w.label} className="flex h-full min-w-0 flex-1 flex-col justify-end">
              <div
                style={{ height: `${Math.max(6, (w.sets / max) * 100)}%`, animationDelay: `${i * 45}ms` }}
                className={
                  "w-full origin-bottom animate-grow rounded-[6px] " +
                  (now ? "bg-accent" : w.deload ? "bg-zone-rest-soft" : "bg-sky/45")
                }
              />
            </div>
          );
        })}
      </div>
      <div aria-hidden className="flex gap-1.5 sm:gap-2">
        {weeks.map((w, i) => (
          <span
            key={w.label}
            className={
              "min-w-0 flex-1 truncate text-center text-meta tabular-nums " +
              (i === current ? "font-semibold text-accent" : "text-fg-subtle")
            }
          >
            {w.label}
          </span>
        ))}
      </div>
    </figure>
  );
}
