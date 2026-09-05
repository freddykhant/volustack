import type { TrainingStatusView, Zone } from "~/views/types";

const DOT: Record<TrainingStatusView["label"], string> = {
  Recovering: "bg-zone-rest",
  Building: "bg-zone-building",
  Optimal: "bg-zone-optimal",
  Overreaching: "bg-zone-max",
};

const STRIP: Record<Zone, string> = {
  rest: "bg-zone-rest",
  building: "bg-zone-building",
  optimal: "bg-zone-optimal",
  max: "bg-zone-max",
};

const ORDER: Zone[] = ["rest", "building", "optimal", "max"];

export function TrainingStatusCard({ status }: { status: TrainingStatusView }) {
  return (
    <div className="rounded-card border border-border bg-surface p-6">
      <div className="text-eyebrow font-medium text-fg-soft">Training status</div>
      <div className="mt-2 flex items-center gap-2">
        <span className={`size-2.5 rounded-full ${DOT[status.label]}`} aria-hidden />
        <span className="text-card-title text-fg">{status.label}</span>
      </div>
      <div className="mt-1 text-card-desc text-fg-muted">
        {status.total === 0
          ? "No volume planned"
          : `${status.inRange} of ${status.total} muscles in range`}
      </div>
      {status.total > 0 ? (
        <div className="mt-4 flex h-2 overflow-hidden rounded-pill" aria-hidden>
          {ORDER.map((zone) =>
            status.counts[zone] > 0 ? (
              <div
                key={zone}
                className={STRIP[zone]}
                style={{ flexGrow: status.counts[zone] }}
              />
            ) : null,
          )}
        </div>
      ) : null}
    </div>
  );
}
