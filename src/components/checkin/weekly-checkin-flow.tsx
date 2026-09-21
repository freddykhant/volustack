"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "~/trpc/react";
import type { ProgressionProposalView } from "~/views/types";
import { WeeklyCheckInEntry } from "./weekly-checkin-entry";
import { WeeklyCheckInGrid, type MuscleScore } from "./weekly-checkin-grid";
import { ProgressionProposalDialog } from "./progression-proposal-dialog";

type Stage = "closed" | "grid" | "proposal";

/** Orchestrates the end-of-week loop: entry CTA → recovery/joint grid → progression
 * proposal. The single component the pages render for weekly check-in. */
export function WeeklyCheckInFlow({ weekIndex }: { weekIndex: number }) {
  const router = useRouter();
  const utils = api.useUtils();
  const q = api.checkin.getWeeklyCheckIn.useQuery({ weekIndex });
  const [stage, setStage] = useState<Stage>("closed");
  const [muscles, setMuscles] = useState<MuscleScore[]>([]);
  const [proposal, setProposal] = useState<ProgressionProposalView | null>(null);
  const gridPanelRef = useRef<HTMLDivElement>(null);
  const gridRestoreFocusTo = useRef<HTMLElement | null>(null);

  const submit = api.checkin.submitWeeklyCheckIn.useMutation({
    onSuccess: (view) => { setProposal(view); setStage("proposal"); },
  });
  const apply = api.checkin.applyProgression.useMutation({
    onSuccess: async () => { setStage("closed"); await utils.checkin.getWeeklyCheckIn.invalidate({ weekIndex }); router.refresh(); },
  });
  const reject = api.checkin.rejectProgression.useMutation({
    onSuccess: async () => { setStage("closed"); await utils.checkin.getWeeklyCheckIn.invalidate({ weekIndex }); },
  });

  function open() {
    const trained = q.data?.trainedMuscles ?? [];
    const existing = new Map((q.data?.existing ?? []).map((e) => [e.muscle, e]));
    setMuscles(trained.map((m) => ({ muscle: m, recovery: existing.get(m)?.recovery ?? 2, joint: existing.get(m)?.joint ?? 0 })));
    setStage("grid");
  }

  // Modal keyboard contract for the grid overlay: focus moves into the panel on
  // open, Escape closes it, Tab is trapped inside, and focus returns to the
  // trigger on close. Mirrors ProgressionProposalDialog / reschedule-dialog.tsx.
  useEffect(() => {
    if (stage !== "grid") return;
    gridRestoreFocusTo.current = document.activeElement as HTMLElement | null;
    gridPanelRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setStage("closed");
      if (e.key === "Tab" && gridPanelRef.current) {
        const f = gridPanelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])');
        if (f.length === 0) return;
        const first = f[0]!;
        const last = f[f.length - 1]!;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); gridRestoreFocusTo.current?.focus(); };
  }, [stage]);

  return (
    <>
      <WeeklyCheckInEntry weekIndex={weekIndex} onOpen={open} />

      {stage === "grid" ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setStage("closed"); }}
        >
          <div
            ref={gridPanelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="grid-title"
            aria-describedby="grid-desc"
            className="mt-12 w-full max-w-lg rounded-card border border-border bg-canvas p-6 outline-none"
          >
            <div className="flex items-baseline justify-between">
              <h2 id="grid-title" className="text-card-title text-fg">Week {weekIndex} check-in</h2>
              <button type="button" onClick={() => setStage("closed")} className="text-nav text-fg-subtle hover:text-fg">Close</button>
            </div>
            <p id="grid-desc" className="mt-1 text-nav text-fg-muted">How recovered does each muscle feel? Any joints complaining?</p>
            <div className="mt-4">
              <WeeklyCheckInGrid
                muscles={muscles}
                onChange={setMuscles}
                isPending={submit.isPending}
                onSubmit={() => submit.mutate({ weekIndex, muscles })}
              />
            </div>
            {submit.isError ? <p className="mt-3 rounded-control border border-border bg-callout px-3 py-2 text-nav text-fg-soft">{submit.error.message}</p> : null}
          </div>
        </div>
      ) : null}

      {stage === "proposal" && proposal ? (
        <ProgressionProposalDialog
          proposal={proposal}
          isPending={apply.isPending || reject.isPending}
          onAccept={() => apply.mutate({ weekIndex })}
          onReject={() => (proposal.kind === "CHANGES" ? reject.mutate({ weekIndex }) : setStage("closed"))}
          errorMessage={apply.error?.message ?? reject.error?.message}
        />
      ) : null}
    </>
  );
}
