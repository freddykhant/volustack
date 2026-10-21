"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, PencilLine, CalendarX, ArrowDownToLine } from "lucide-react";
import type { PrescriptionView, SessionView } from "~/views/types";
import { api } from "~/trpc/react";
import { RescheduleDialog } from "~/components/block/reschedule-dialog";
import { MuscleChips, PrescriptionLine, SessionMeta } from "~/components/block/session-card";
import { Button, Chip, Panel } from "~/components/ui-kit/app-shell-kit";

type SetRow = { weight: string; reps: string; rir: string };

/** Session status pill. Neutral surface + icon shape carry the state — the
 * zone-* palette is data-only, so it never dresses status chrome. */
function StatusBadge({ status }: { status: SessionView["status"] }) {
  if (status === "COMPLETED") return <Chip icon={Check}>Completed</Chip>;
  if (status === "MISSED") return <Chip icon={CalendarX}>Missed</Chip>;
  return <span className="text-meta text-fg-subtle">Scheduled</span>;
}

/** Inline note inside a session panel: draft restored, blank-set warning, errors. */
function PanelNote({ children, role }: { children: React.ReactNode; role?: "alert" | "status" }) {
  return (
    <p role={role} className="rounded-callout bg-callout px-3.5 py-2.5 text-card-desc text-fg-soft">
      {children}
    </p>
  );
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
    <Panel className="flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="text-card-title text-fg">{session.label}</span>
          <StatusBadge status={session.status} />
        </div>
        <div className="pt-0.5">
          <SessionMeta session={session} />
        </div>
      </div>

      {editing ? (
        <div className="mt-4 flex flex-col gap-5">
          {draftRestored && <PanelNote role="status">Picked up where you left off — your typed sets were saved.</PanelNote>}
          {session.prescriptions.map((p, pi) => (
            <LogRows key={`${p.exerciseName}-${pi}`} p={p} rows={rows[pi]!} pi={pi} onCell={setCell} onFill={() => fillDown(pi)} />
          ))}
          {skipWarn !== null && (
            <PanelNote role="status">
              {skipWarn === 1 ? "1 set is" : `${skipWarn} sets are`} left blank and won’t be logged. Tap Finish again to log the rest.
            </PanelNote>
          )}
          {logSession.isError && <PanelNote role="alert">{logSession.error.message}</PanelNote>}
          <div className="flex items-center gap-2 border-t border-border-subtle pt-4">
            <Button variant="primary" icon={Check} loading={logSession.isPending} onClick={finish}>
              {logSession.isPending ? "Saving…" : skipWarn !== null ? "Finish anyway" : "Finish session"}
            </Button>
            <Button variant="ghost" onClick={cancelEdit}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <ul className="mt-3 flex flex-col divide-y divide-border-subtle">
            {session.prescriptions.map((p, i) => (
              <li key={`${p.exerciseName}-${i}`} className="py-3 first:pt-1">
                <PrescriptionLine p={p} />
                {p.loggedSets && p.loggedSets.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {p.loggedSets.map((l, k) => (
                      <span
                        key={k}
                        className="inline-flex h-6 items-center rounded-pill bg-sunken px-2.5 text-[12px] leading-none text-fg-soft tabular-nums"
                      >
                        {`${l.weightKg}×${l.reps}${l.achievedRir === null ? "" : ` @${l.achievedRir}`}`}
                      </span>
                    ))}
                  </div>
                ) : (
                  <MuscleChips p={p} />
                )}
              </li>
            ))}
          </ul>
          {session.status === "SCHEDULED" ? (
            <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border-subtle pt-4">
              <Button variant="primary" icon={PencilLine} onClick={() => setEditing(true)}>
                Log session
              </Button>
              <Button variant="ghost" icon={CalendarX} onClick={() => setRescheduling(true)}>
                Mark missed
              </Button>
            </div>
          ) : session.status === "COMPLETED" ? (
            <div className="mt-auto border-t border-border-subtle pt-3">
              <Button variant="ghost" size="sm" icon={PencilLine} onClick={() => setEditing(true)} className="-ml-3">
                Edit log
              </Button>
            </div>
          ) : null}
          <RescheduleDialog sessionId={session.slotId} open={rescheduling} onClose={() => setRescheduling(false)} />
        </>
      )}
    </Panel>
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
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-body font-medium text-fg">{p.exerciseName}</div>
          <div className="text-meta text-fg-subtle tabular-nums">
            target {p.repRangeLow}–{p.repRangeHigh} reps @ {p.targetRir} RIR
          </div>
        </div>
        <Button variant="ghost" size="sm" icon={ArrowDownToLine} onClick={onFill} className="-mr-2">
          fill down
        </Button>
      </div>
      {rows.map((r, si) => (
        <div key={si} className="grid grid-cols-[2.75rem_1fr_1fr_1fr] items-center gap-2">
          <span className="text-meta text-fg-subtle tabular-nums">Set {si + 1}</span>
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
    <div className="relative min-w-0">
      <input
        type="number"
        inputMode={inputMode}
        aria-label={ariaLabel}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full [appearance:textfield] rounded-control border border-transparent bg-sunken px-3 pr-10 text-body text-fg tabular-nums transition-[background-color,border-color] duration-200 placeholder:text-fg-subtle focus:border-border-strong focus:bg-surface-raised [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[12px] text-fg-subtle">{unit}</span>
    </div>
  );
}
