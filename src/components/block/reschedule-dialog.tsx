"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { api } from "~/trpc/react";
import { Button, Skeleton } from "~/components/ui-kit/app-shell-kit";

export function RescheduleDialog({
  sessionId,
  open,
  onClose,
  onApplied,
  title,
}: {
  sessionId: string;
  open: boolean;
  onClose: () => void;
  /** Called when the reschedule was applied, just before `onClose`. */
  onApplied?: () => void;
  /** Replaces the heading when the dialog is opened for a session not yet missed. */
  title?: string;
}) {
  const router = useRouter();
  const options = api.session.getRescheduleOptions.useQuery({ sessionId }, { enabled: open });
  const apply = api.session.applyReschedule.useMutation({
    onSuccess: () => {
      onApplied?.();
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
      className="fixed inset-0 z-50 grid place-items-center bg-scrim p-4 backdrop-blur-[2px] animate-fade"
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
        className="w-full max-w-[480px] rounded-sheet bg-surface-raised p-6 shadow-pop outline-none animate-rise"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="reschedule-title" className="text-card-title text-fg">
            {title ?? "Missed it? Let’s adjust."}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose} className="-mt-1 -mr-2">
            Close
          </Button>
        </div>
        <p id="reschedule-desc" className="mt-1.5 text-card-desc text-fg-muted">
          Here’s how we can recover the volume — your call.
        </p>

        <div className="mt-5 flex flex-col gap-2.5">
          {options.isLoading && (
            <div aria-busy="true" className="flex flex-col gap-2.5">
              <p className="sr-only">Finding your best options…</p>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-[84px] w-full rounded-callout" />
              ))}
            </div>
          )}
          {options.isError && (
            <div role="alert" className="rounded-callout bg-callout px-3.5 py-3 text-card-desc text-fg-soft">
              <p>Couldn’t load your options. {options.error.message}</p>
              <Button variant="secondary" size="sm" onClick={() => void options.refetch()} className="mt-2.5">
                Try again
              </Button>
            </div>
          )}
          {options.data?.map((o) => (
            <button
              key={o.kind}
              type="button"
              disabled={apply.isPending}
              onClick={() => apply.mutate({ sessionId, kind: o.kind })}
              className={
                "flex flex-col gap-1 rounded-callout border p-4 text-left transition-colors duration-200 disabled:opacity-60 " +
                (o.recommended
                  ? "border-accent bg-selection"
                  : "border-border bg-surface-raised hover:border-border-strong hover:bg-hover")
              }
            >
              <div className="flex items-start justify-between gap-3">
                <span className="flex flex-wrap items-center gap-x-2">
                  <span className={"text-list " + (o.recommended ? "text-accent" : "text-fg")}>
                    {o.kind === "MAKE_UP" ? "Make it up" : o.kind === "PARTIAL" ? "Partial recovery" : "Let it go"}
                    {o.recommended ? " · recommended" : ""}
                  </span>
                  {o.closeCall ? <span className="text-meta text-fg-muted">Close call</span> : null}
                </span>
                <span className="shrink-0 text-meta text-fg-subtle tabular-nums">
                  +{o.recoveredSets} recovered · {o.droppedSets} dropped
                </span>
              </div>
              <span className="text-card-desc text-fg-muted">{o.summary}</span>
              {o.perSession.length > 0 ? (
                <span className="text-meta text-fg-subtle tabular-nums">
                  {o.perSession.map((s) => `${s.label} +${s.addedSets}`).join(" · ")}
                </span>
              ) : null}
            </button>
          ))}
          {apply.isError && (
            <p role="alert" className="rounded-callout bg-callout px-3.5 py-2.5 text-card-desc text-fg-soft">
              {apply.error.message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
