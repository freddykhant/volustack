"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, PencilLine, CalendarX } from "lucide-react";
import type { PrescriptionView, SessionView } from "~/views/types";
import { api } from "~/trpc/react";
import { RescheduleDialog } from "~/components/block/reschedule-dialog";

type SetRow = { weight: string; reps: string; rir: string };

function short(m: string): string {
  return m.replace(/_/g, " ").toLowerCase();
}

/** Session status pill. Neutral surface + icon shape carry the state — the
 * zone-* palette is data-only, so it never dresses status chrome. */
function StatusBadge({ status }: { status: SessionView["status"] }) {
  const base = "inline-flex items-center gap-1 rounded-pill bg-surface-raised px-2 py-0.5 text-[12px]";
  if (status === "COMPLETED") {
    return (
      <span className={`${base} text-fg-soft`}>
        <Check className="size-3" aria-hidden /> Completed
      </span>
    );
  }
  if (status === "MISSED") {
    return (
      <span className={`${base} text-fg`}>
        <CalendarX className="size-3" aria-hidden /> Missed
      </span>
    );
  }
  return <span className={`${base} text-fg-subtle`}>Scheduled</span>;
}

function defaultRows(session: SessionView): SetRow[][] {
  return session.prescriptions.map((p) => {
    // Pre-fill from what was logged so a COMPLETED session can be corrected.
    if (p.loggedSets && p.loggedSets.length > 0) {
      return p.loggedSets.map((l) => ({
        weight: String(l.weightKg),
        reps: String(l.reps),
        rir: l.achievedRir === null ? "" : String(l.achievedRir),
      }));
    }
    return Array.from({ length: Math.max(p.sets, 1) }, () => ({ weight: "", reps: "", rir: "" }));
  });
}

export function SessionPanel({ session }: { session: SessionView }) {
  const router = useRouter();
  const draftKey = `mesodapt:log-draft:${session.slotId}`;
  const [editing, setEditing] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [skipWarn, setSkipWarn] = useState<number | null>(null);
  // rows[prescriptionIndex] = one row per planned set
  const [rows, setRows] = useState<SetRow[][]>(() => defaultRows(session));
  const draftLoaded = useRef(false);

  // Restore an in-progress draft (typed sets never submitted) so a locked
  // phone / refresh mid-workout doesn't lose the session. Client-only, keyed
  // by session id; runs once after mount to avoid an SSR hydration mismatch.
  useEffect(() => {
    if (session.status !== "SCHEDULED") {
      draftLoaded.current = true;
      return;
    }
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const saved = JSON.parse(raw) as SetRow[][];
        if (
          Array.isArray(saved) &&
          saved.length === session.prescriptions.length &&
          saved.some((pr) => pr.some((r) => r.weight || r.reps || r.rir))
        ) {
          setRows(saved);
          setEditing(true);
          setDraftRestored(true);
        }
      }
    } catch {
      /* ignore a malformed draft */
    }
    draftLoaded.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the draft on every change, once the initial load has run.
  useEffect(() => {
    if (!draftLoaded.current || session.status !== "SCHEDULED") return;
    try {
      localStorage.setItem(draftKey, JSON.stringify(rows));
    } catch {
      /* storage full / unavailable — non-fatal */
    }
  }, [rows, draftKey, session.status]);

  const logSession = api.session.logSession.useMutation({
    onSuccess: () => {
      try {
        localStorage.removeItem(draftKey);
      } catch {
        /* non-fatal */
      }
      setEditing(false);
      setDraftRestored(false);
      router.refresh();
    },
  });

  function setCell(pi: number, si: number, key: keyof SetRow, value: string) {
    setSkipWarn(null);
    setRows((prev) => prev.map((pr, i) => (i === pi ? pr.map((r, j) => (j === si ? { ...r, [key]: value } : r)) : pr)));
  }
  function fillDown(pi: number) {
    setSkipWarn(null);
    setRows((prev) => prev.map((pr, i) => (i === pi && pr[0] ? pr.map(() => ({ ...pr[0]! })) : pr)));
  }
  function cancelEdit() {
    setEditing(false);
    setDraftRestored(false);
    setSkipWarn(null);
    setRows(defaultRows(session));
    try {
      localStorage.removeItem(draftKey);
    } catch {
      /* non-fatal */
    }
  }

  function finish() {
    const num = (s: string) => (s.trim() === "" ? NaN : Number(s));
    const sets = session.prescriptions.flatMap((p, pi) =>
      rows[pi]!.flatMap((r, si) => {
        const w = num(r.weight),
          reps = num(r.reps),
          rir = num(r.rir);
        if (Number.isNaN(w) || Number.isNaN(reps)) return []; // skip un-filled sets
        return [
          {
            prescriptionId: p.id,
            setNumber: si + 1,
            weightKg: w,
            reps,
            achievedRir: Number.isNaN(rir) ? undefined : rir,
          },
        ];
      }),
    );
    // Don't silently drop blank sets — confirm on a second tap.
    const planned = rows.reduce((n, pr) => n + pr.length, 0);
    const skipped = planned - sets.length;
    if (skipped > 0 && skipWarn === null) {
      setSkipWarn(skipped);
      return;
    }
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
          {draftRestored && (
            <p className="rounded-control border border-border-subtle bg-callout px-3 py-2 text-[12px] text-fg-soft">
              Picked up where you left off — your typed sets were saved.
            </p>
          )}
          {session.prescriptions.map((p, pi) => (
            <LogRows key={`${p.exerciseName}-${pi}`} p={p} rows={rows[pi]!} pi={pi} onCell={setCell} onFill={() => fillDown(pi)} />
          ))}
          {skipWarn !== null && (
            <p className="rounded-control border border-border-subtle bg-callout px-3 py-2 text-nav text-fg-soft">
              {skipWarn === 1 ? "1 set is" : `${skipWarn} sets are`} left blank and won’t be logged. Tap Finish again to log the rest.
            </p>
          )}
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
              <Check className="size-4" aria-hidden />{" "}
              {logSession.isPending ? "Saving…" : skipWarn !== null ? "Finish anyway" : "Finish session"}
            </button>
            <button type="button" onClick={cancelEdit} className="text-nav text-fg-muted hover:text-fg">
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
                      <span key={c.muscle} className={"rounded-pill px-1.5 py-0.5 text-[12px] " + (c.role === "PRIMARY" ? "bg-surface-raised text-fg-soft" : "text-fg-subtle")}>
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
                className="inline-flex items-center gap-2 rounded-control bg-accent px-4 py-2 text-nav font-medium text-white transition-colors hover:bg-accent-strong"
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
          ) : session.status === "COMPLETED" ? (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1.5 text-nav text-fg-muted transition-colors hover:text-fg"
              >
                <PencilLine className="size-4" aria-hidden /> Edit log
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
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-nav text-fg">{p.exerciseName}</span>
          <span className="text-[12px] text-fg-subtle">
            target {p.repRangeLow}–{p.repRangeHigh} reps @ {p.targetRir} RIR
          </span>
        </div>
        <button type="button" onClick={onFill} className="shrink-0 text-[12px] text-fg-subtle hover:text-fg">
          fill down
        </button>
      </div>
      {rows.map((r, si) => (
        <div key={si} className="flex items-center gap-2">
          <span className="w-10 text-[12px] text-fg-subtle">Set {si + 1}</span>
          <CellInput value={r.weight} onChange={(v) => onCell(pi, si, "weight", v)} unit="kg" ariaLabel={`Set ${si + 1} weight, kilograms`} inputMode="decimal" min={0} step={0.5} />
          <CellInput value={r.reps} onChange={(v) => onCell(pi, si, "reps", v)} unit="reps" ariaLabel={`Set ${si + 1} reps`} inputMode="numeric" min={0} step={1} />
          <CellInput value={r.rir} onChange={(v) => onCell(pi, si, "rir", v)} unit="RIR" ariaLabel={`Set ${si + 1} reps in reserve`} inputMode="numeric" min={0} max={10} step={1} />
        </div>
      ))}
    </div>
  );
}

function CellInput({
  value,
  onChange,
  unit,
  ariaLabel,
  inputMode,
  min,
  max,
  step,
}: {
  value: string;
  onChange: (v: string) => void;
  unit: string;
  ariaLabel: string;
  inputMode: "decimal" | "numeric";
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div className="relative flex-1">
      <input
        type="number"
        inputMode={inputMode}
        aria-label={ariaLabel}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-control border border-border-subtle bg-canvas px-2 py-1.5 pr-9 text-body text-fg outline-none transition-colors focus:border-accent"
      />
      <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[12px] text-fg-subtle">{unit}</span>
    </div>
  );
}
