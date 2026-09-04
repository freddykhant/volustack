import type { SessionView } from "~/views/types";

function short(m: string): string {
  return m.replace(/_/g, " ").toLowerCase();
}

export function SessionCard({ session }: { session: SessionView }) {
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <div className="text-card-title text-fg">{session.label}</div>
        <div className="text-[12px] text-fg-subtle">
          {session.dayTag ? `${session.dayTag} · ` : ""}
          {session.estimatedMinutes} min
        </div>
      </div>
      <ul className="mt-3 flex flex-col gap-3">
        {session.prescriptions.map((p, i) => (
          <li key={`${p.exerciseName}-${i}`}>
            <div className="text-body text-fg">
              {p.exerciseName} — {p.sets} × {p.repRangeLow}–{p.repRangeHigh} @ {p.targetRir} RIR
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {p.muscles.map((c) => (
                <span
                  key={c.muscle}
                  className={
                    "rounded-pill px-1.5 py-0.5 text-[11px] " +
                    (c.role === "PRIMARY" ? "bg-surface-raised text-fg-soft" : "text-fg-subtle")
                  }
                >
                  {short(c.muscle)} {c.fraction}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
