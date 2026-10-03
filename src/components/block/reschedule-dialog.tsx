"use client";

import { useEffect, useRef } from "react";
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
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusTo = useRef<HTMLElement | null>(null);

  // Modal keyboard contract: focus moves into the dialog on open, Escape
  // closes it, Tab is trapped inside, and focus returns to the trigger on
  // close. Without this a keyboard/SR user can tab out into the page behind.
  useEffect(() => {
    if (!open) return;
    restoreFocusTo.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Tab" && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0]!;
        const last = focusables[focusables.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      restoreFocusTo.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reschedule-title"
        aria-describedby="reschedule-desc"
        className="w-full max-w-md rounded-card border border-border bg-canvas p-6 outline-none"
      >
        <div className="flex items-baseline justify-between">
          <h2 id="reschedule-title" className="text-card-title text-fg">
            Missed it? Let’s adjust.
          </h2>
          <button type="button" onClick={onClose} className="text-nav text-fg-subtle hover:text-fg">
            Close
          </button>
        </div>
        <p id="reschedule-desc" className="mt-1 text-nav text-fg-muted">
          Here’s how we can recover the volume — your call.
        </p>

        <div className="mt-4 flex flex-col gap-2">
          {options.isLoading && <p className="text-nav text-fg-subtle">Finding your best options…</p>}
          {options.isError && (
            <div className="rounded-control border border-border bg-callout px-3 py-2 text-nav text-fg-soft">
              <p>Couldn’t load your options. {options.error.message}</p>
              <button
                type="button"
                onClick={() => void options.refetch()}
                className="mt-1 text-nav font-medium text-accent transition-colors hover:text-accent-strong"
              >
                Try again
              </button>
            </div>
          )}
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
                <span className="flex items-center">
                  <span className={"text-nav font-medium " + (o.recommended ? "text-accent" : "text-fg")}>
                    {o.kind === "MAKE_UP" ? "Make it up" : o.kind === "PARTIAL" ? "Partial recovery" : "Let it go"}
                    {o.recommended ? " · recommended" : ""}
                  </span>
                  {o.closeCall ? (
                    <span className="ml-2 text-[12px] text-fg-muted">Close call</span>
                  ) : null}
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
