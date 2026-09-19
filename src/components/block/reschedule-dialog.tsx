"use client";

import { useRouter } from "next/navigation";
import { api } from "~/trpc/react";

export function RescheduleDialog({
  sessionId,
  open,
  onClose,
}: {
  sessionId: string;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const options = api.session.getRescheduleOptions.useQuery({ sessionId }, { enabled: open });
  const apply = api.session.applyReschedule.useMutation({
    onSuccess: () => {
      onClose();
      router.refresh();
    },
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-card border border-border bg-canvas p-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-card-title text-fg">Missed this session?</h2>
          <button type="button" onClick={onClose} className="text-nav text-fg-subtle hover:text-fg">
            Close
          </button>
        </div>
        <p className="mt-1 text-nav text-fg-muted">Choose how to handle the volume you missed.</p>

        <div className="mt-4 flex flex-col gap-2">
          {options.isLoading && <p className="text-nav text-fg-subtle">Working out your options…</p>}
          {options.data?.map((o) => (
            <button
              key={o.kind}
              type="button"
              disabled={apply.isPending}
              onClick={() => apply.mutate({ sessionId, kind: o.kind })}
              className={
                "flex flex-col gap-1 rounded-control border p-4 text-left transition-colors disabled:opacity-60 " +
                (o.recommended ? "border-accent bg-selection" : "border-border-subtle hover:border-border")
              }
            >
              <div className="flex items-center justify-between">
                <span className={"text-nav font-medium " + (o.recommended ? "text-accent" : "text-fg")}>
                  {o.kind === "MAKE_UP" ? "Make it up" : o.kind === "PARTIAL" ? "Partial recovery" : "Let it go"}
                  {o.recommended ? " · recommended" : ""}
                </span>
                <span className="text-[12px] text-fg-subtle">
                  +{o.recoveredSets} recovered · {o.droppedSets} dropped
                </span>
              </div>
              <span className="text-[12px] text-fg-muted">{o.summary}</span>
              {o.perSession.length > 0 ? (
                <span className="text-[12px] text-fg-subtle">
                  {o.perSession.map((s) => `${s.label} +${s.addedSets}`).join(" · ")}
                </span>
              ) : null}
            </button>
          ))}
          {apply.isError && (
            <p className="rounded-control border border-border bg-callout px-3 py-2 text-nav text-fg-soft">
              {apply.error.message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
