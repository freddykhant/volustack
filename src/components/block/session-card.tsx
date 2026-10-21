import { Panel } from "~/components/ui-kit/app-shell-kit";
import type { PrescriptionView, SessionView } from "~/views/types";

function short(m: string): string {
  return m.replace(/_/g, " ").toLowerCase();
}

/** "Mon · 55 min" — quiet, right of the session title. */
export function SessionMeta({ session }: { session: SessionView }) {
  return (
    <div className="shrink-0 text-meta whitespace-nowrap text-fg-subtle tabular-nums">
      {session.dayTag ? `${session.dayTag} · ` : ""}
      {session.estimatedMinutes} min
    </div>
  );
}

/** Exercise name over its prescription line ("3 × 8–12 @ 2 RIR"). */
export function PrescriptionLine({ p }: { p: PrescriptionView }) {
  return (
    <>
      <div className="text-body font-medium text-fg">{p.exerciseName}</div>
      <div className="mt-0.5 text-meta text-fg-muted tabular-nums">
        {p.sets} × {p.repRangeLow}–{p.repRangeHigh} @ {p.targetRir} RIR
      </div>
    </>
  );
}

/** Muscle contributions: primary movers in a sunken pill, secondaries as plain text. */
export function MuscleChips({ p }: { p: PrescriptionView }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {p.muscles.map((c) => (
        <span
          key={c.muscle}
          className={
            "inline-flex h-5 items-center rounded-pill px-2 text-[12px] leading-none tabular-nums " +
            (c.role === "PRIMARY" ? "bg-sunken text-fg-soft" : "text-fg-subtle")
          }
        >
          {short(c.muscle)} {c.fraction}
        </span>
      ))}
    </div>
  );
}

export function SessionCard({ session }: { session: SessionView }) {
  return (
    <Panel>
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-card-title text-fg">{session.label}</div>
        <SessionMeta session={session} />
      </div>
      <ul className="mt-3 flex flex-col divide-y divide-border-subtle">
        {session.prescriptions.map((p, i) => (
          <li key={`${p.exerciseName}-${i}`} className="py-3 first:pt-1 last:pb-0">
            <PrescriptionLine p={p} />
            <MuscleChips p={p} />
          </li>
        ))}
      </ul>
    </Panel>
  );
}
