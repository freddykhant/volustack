"use client";

import { useEffect, useRef } from "react";
import { ArrowRight, TriangleAlert } from "lucide-react";
import type { ProgressionProposalView } from "~/views/types";

const CAUSE_COPY: Record<string, string> = {
  responding_well: "responding well",
  under_recovered: "under-recovered",
  joint_stress: "joint stress",
  approaching_mrv: "approaching your ceiling",
  on_track: "on track",
  default_progression: "steady progression",
};

function humanMuscle(m: string): string {
  return m.charAt(0) + m.slice(1).toLowerCase().replace(/_/g, " ");
}

export function ProgressionProposalDialog({
  proposal,
  onAccept,
  onReject,
  isPending,
  errorMessage,
}: {
  proposal: ProgressionProposalView;
  onAccept: () => void;
  onReject: () => void;
  isPending: boolean;
  errorMessage?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusTo = useRef<HTMLElement | null>(null);

  // Modal keyboard contract: focus moves into the dialog on open, Escape
  // closes it, Tab is trapped inside, and focus returns to the trigger on
  // close. Mirrors src/components/block/reschedule-dialog.tsx.
  useEffect(() => {
    restoreFocusTo.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onReject();
      if (e.key === "Tab" && panelRef.current) {
        const f = panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])');
        if (f.length === 0) return;
        const first = f[0]!;
        const last = f[f.length - 1]!;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); restoreFocusTo.current?.focus(); };
  }, [onReject]);

  const informational = proposal.kind !== "CHANGES";
  const title =
    proposal.kind === "BLOCK_END" ? "Block’s final week" : proposal.kind === "DELOAD_HOLD" ? "Deload ahead" : `Week ${proposal.appliesToWeekIndex} — your next move`;
  const subtitle =
    proposal.kind === "BLOCK_END"
      ? "Nothing to progress into — nice work closing the block."
      : proposal.kind === "DELOAD_HOLD"
        ? "Next week is your planned deload — we’re holding volume so you recover."
        : "Here’s how next week adapts to what you just did — your call.";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) onReject(); }}>
      <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="prog-title" aria-describedby="prog-desc" className="w-full max-w-md rounded-card border border-border bg-canvas p-6 outline-none">
        <h2 id="prog-title" className="text-card-title text-fg">{title}</h2>
        <p id="prog-desc" className="mt-1 text-nav text-fg-muted">{subtitle}</p>

        {proposal.advisory ? (
          <div className="mt-3 flex items-start gap-2 rounded-control border border-border bg-callout px-3 py-2 text-nav text-fg-soft">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-fg-muted" aria-hidden />
            <span>{proposal.advisory}</span>
          </div>
        ) : null}

        {!informational ? (
          <div className="mt-4 flex flex-col gap-2">
            {proposal.adjustments.length === 0 ? (
              <p className="rounded-control border border-border-subtle px-3 py-2 text-nav text-fg-muted">You’re right on plan — holding volume next week.</p>
            ) : (
              proposal.adjustments.map((a) => (
                <div key={a.muscle} className="flex items-center justify-between rounded-control border border-border-subtle px-3 py-2">
                  <div className="flex items-center gap-2 text-nav text-fg">
                    <span className="font-medium">{humanMuscle(a.muscle)}</span>
                    <span className="text-fg-subtle">{a.plannedSets} → {a.adjustedSets}</span>
                    <span className={a.delta > 0 ? "text-zone-optimal" : a.delta < 0 ? "text-zone-rest" : "text-fg-subtle"}>
                      {a.delta > 0 ? `+${a.delta}` : a.delta}
                    </span>
                  </div>
                  <span className="text-[12px] text-fg-muted">
                    {CAUSE_COPY[a.cause] ?? a.cause}{a.swapCandidate ? " · consider a swap" : ""}
                  </span>
                </div>
              ))
            )}
          </div>
        ) : null}

        {errorMessage ? (
          <p className="mt-3 rounded-control border border-border bg-callout px-3 py-2 text-nav text-fg-soft">{errorMessage}</p>
        ) : null}

        <div className="mt-5 flex items-center justify-end gap-2">
          {informational ? (
            <button type="button" onClick={onReject} className="rounded-control bg-accent px-5 py-2.5 text-nav font-medium text-white hover:bg-accent-strong">Got it</button>
          ) : (
            <>
              <button type="button" disabled={isPending} onClick={onReject} className="rounded-control border border-border px-4 py-2.5 text-nav text-fg-soft hover:text-fg disabled:opacity-60">Keep as-is</button>
              <button type="button" disabled={isPending} onClick={onAccept} className="inline-flex items-center gap-2 rounded-control bg-accent px-5 py-2.5 text-nav font-medium text-white hover:bg-accent-strong disabled:opacity-60">
                Accept plan <ArrowRight className="size-4" aria-hidden />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
