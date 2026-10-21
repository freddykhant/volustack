import { Panel } from "~/components/ui-kit/app-shell-kit";
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

const ZONE_WORD: Record<Zone, string> = {
  rest: "recovering",
  building: "building",
  optimal: "optimal",
  max: "overreaching",
};

export function TrainingStatusCard({ status }: { status: TrainingStatusView }) {
  const present = ORDER.filter((z) => status.counts[z] > 0);
  return (
    <Panel as="section" aria-label="Training status" className="flex flex-col">
      <div className="text-eyebrow font-medium text-fg-subtle">Training status</div>
      <div className="mt-3 flex items-center gap-2">
        <span className={`size-2.5 rounded-full ${DOT[status.label]}`} aria-hidden />
        <span className="text-card-title text-fg">{status.label}</span>
      </div>
      <div className="mt-1 text-card-desc text-fg-muted">
        {status.total === 0 ? (
          "No volume planned"
        ) : (
          <>
            <span className="tabular-nums">
              {status.inRange} of {status.total}
            </span>{" "}
            muscles in range
          </>
        )}
      </div>
      {status.total > 0 ? (
        <div className="mt-auto pt-5">
          <div
            className="flex h-1.5 gap-0.5 overflow-hidden rounded-pill"
            role="img"
            aria-label={`Muscles by zone: ${present
              .map((z) => `${status.counts[z]} ${ZONE_WORD[z]}`)
              .join(", ")}`}
          >
            {present.map((zone) => (
              <div
                key={zone}
                className={`${STRIP[zone]} first:rounded-l-pill last:rounded-r-pill`}
                style={{ flexGrow: status.counts[zone] }}
              />
            ))}
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-meta text-fg-muted" aria-hidden>
            {present.map((zone) => (
              <li key={zone} className="inline-flex items-center gap-1.5">
                <span className={`size-1.5 rounded-full ${STRIP[zone]}`} />
                <span className="tabular-nums text-fg-soft">{status.counts[zone]}</span>
                {ZONE_WORD[zone]}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Panel>
  );
}
