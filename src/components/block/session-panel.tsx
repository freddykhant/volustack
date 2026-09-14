"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, PencilLine, CalendarX } from "lucide-react";
import type { PrescriptionView, SessionView } from "~/views/types";
import { api } from "~/trpc/react";
import { RescheduleDialog } from "~/components/block/reschedule-dialog";

type SetRow = { weight: string; reps: string; rir: string };

function short(m: string): string {
  return m.replace(/_/g, " ").toLowerCase();
}

function StatusBadge({ status }: { status: SessionView["status"] }) {
  if (status === "COMPLETED") {
    return <span className="rounded-pill bg-zone-optimal-soft px-2 py-0.5 text-[11px] text-fg-soft">Completed</span>;
  }
  if (status === "MISSED") {
    return <span className="rounded-pill bg-zone-max-soft px-2 py-0.5 text-[11px] text-fg-soft">Missed</span>;
  }
  return <span className="rounded-pill bg-surface-raised px-2 py-0.5 text-[11px] text-fg-subtle">Scheduled</span>;
}

export function SessionPanel({ session }: { session: SessionView }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  // rows[prescriptionIndex] = one row per planned set
  const [rows, setRows] = useState<SetRow[][]>(() =>
    session.prescriptions.map((p) =>
      Array.from({ length: Math.max(p.sets, 1) }, () => ({ weight: "", reps: "", rir: "" })),
    ),
  );

  const logSession = api.session.logSession.useMutation({
    onSuccess: () => {
      setEditing(false);
      router.refresh();
    },
  });

  function setCell(pi: number, si: number, key: keyof SetRow, value: string) {
    setRows((prev) => prev.map((pr, i) => (i === pi ? pr.map((r, j) => (j === si ? { ...r, [key]: value } : r)) : pr)));
  }
  function fillDown(pi: number) {
    setRows((prev) =>
      prev.map((pr, i) => (i === pi && pr[0] ? pr.map(() => ({ ...pr[0]! })) : pr)),
    );
  }

  function finish() {
    const num = (s: string) => (s.trim() === "" ? NaN : Number(s));
    const sets = session.prescriptions.flatMap((p, pi) =>
      rows[pi]!.flatMap((r, si) => {
        const w = num(r.weight), reps = num(r.reps), rir = num(r.rir);
        if (Number.isNaN(w) || Number.isNaN(reps)) return []; // skip un-filled sets
        return [{
          prescriptionId: p.id,
          setNumber: si + 1,
          weightKg: w,
          reps,
          achievedRir: Number.isNaN(rir) ? undefined : rir,
        }];
      }),
    );
    logSession.mutate({ sessionId: session.slotId, sets });
  }

  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-card-title text-fg">{session.label}</span>
          <StatusBadge status={session.status} />
        </div>
        <div className="text-[12px] text-fg-subtle">
          {session.dayTag ? `${session.dayTag} · ` : ""}
          {session.estimatedMinutes} min
        </div>
      </div>

      {editing ? (
        <div className="mt-4 flex flex-col gap-4">
          {session.prescriptions.map((p, pi) => (
            <LogRows key={`${p.exerciseName}-${pi}`} p={p} rows={rows[pi]!} pi={pi} onCell={setCell} onFill={() => fillDown(pi)} />
          ))}
          {logSession.isError && (
            <p className="rounded-control border border-border bg-callout px-3 py-2 text-nav text-fg-soft">
              {logSession.error.message}
            </p>
          )}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={finish}
              disabled={logSession.isPending}
              className="inline-flex items-center gap-2 rounded-control bg-accent px-4 py-2 text-nav font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
            >
              <Check className="size-4" aria-hidden /> {logSession.isPending ? "Saving…" : "Finish session"}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="text-nav text-fg-muted hover:text-fg">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <ul className="mt-3 flex flex-col gap-3">
            {session.prescriptions.map((p, i) => (
              <li key={`${p.exerciseName}-${i}`}>
                <div className="text-body text-fg">
                  {p.exerciseName} — {p.sets} × {p.repRangeLow}–{p.repRangeHigh} @ {p.targetRir} RIR
                </div>
                {p.loggedSets && p.loggedSets.length > 0 ? (
                  <div className="mt-1 text-nav text-fg-muted">
                    {p.loggedSets.map((l) => `${l.weightKg}×${l.reps}${l.achievedRir === null ? "" : ` @${l.achievedRir}`}`).join(" · ")}
                  </div>
                ) : (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {p.muscles.map((c) => (
                      <span key={c.muscle} className={"rounded-pill px-1.5 py-0.5 text-[11px] " + (c.role === "PRIMARY" ? "bg-surface-raised text-fg-soft" : "text-fg-subtle")}>
                        {short(c.muscle)} {c.fraction}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
          {session.status === "SCHEDULED" ? (
            <div className="mt-4 flex items-center gap-4">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1.5 text-nav text-fg-muted transition-colors hover:text-fg"
              >
                <PencilLine className="size-4" aria-hidden /> Log session
              </button>
              <button
                type="button"
                onClick={() => setRescheduling(true)}
                className="inline-flex items-center gap-1.5 text-nav text-fg-muted transition-colors hover:text-fg"
              >
                <CalendarX className="size-4" aria-hidden /> Mark missed
              </button>
            </div>
          ) : null}
          <RescheduleDialog sessionId={session.slotId} open={rescheduling} onClose={() => setRescheduling(false)} />
        </>
      )}
    </div>
  );
}

function LogRows({
  p,
  rows,
  pi,
  onCell,
  onFill,
}: {
  p: PrescriptionView;
  rows: SetRow[];
  pi: number;
  onCell: (pi: number, si: number, key: keyof SetRow, value: string) => void;
  onFill: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-nav text-fg">{p.exerciseName}</span>
        <button type="button" onClick={onFill} className="text-[12px] text-fg-subtle hover:text-fg">
          fill down
        </button>
      </div>
      {rows.map((r, si) => (
        <div key={si} className="flex items-center gap-2">
          <span className="w-10 text-[12px] text-fg-subtle">Set {si + 1}</span>
          <CellInput value={r.weight} onChange={(v) => onCell(pi, si, "weight", v)} unit="kg" />
          <CellInput value={r.reps} onChange={(v) => onCell(pi, si, "reps", v)} unit="reps" />
          <CellInput value={r.rir} onChange={(v) => onCell(pi, si, "rir", v)} unit="RIR" />
        </div>
      ))}
    </div>
  );
}

function CellInput({ value, onChange, unit }: { value: string; onChange: (v: string) => void; unit: string }) {
  return (
    <div className="relative flex-1">
      <input
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-control border border-border-subtle bg-canvas px-2 py-1.5 pr-10 text-nav text-fg outline-none transition-colors focus:border-accent"
      />
      <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[11px] text-fg-subtle">{unit}</span>
    </div>
  );
}
