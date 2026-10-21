"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { IconButton } from "~/components/ui-kit/app-shell-kit";
import { RescheduleDialog } from "~/components/block/reschedule-dialog";
import { COACH_MAX_TEXT } from "~/schema";
import { api } from "~/trpc/react";
import type { CoachFinalReply, CoachReply } from "~/views/coach";
import type { AppliedWeek } from "./applied-notice";
import { CoachReplyCard } from "./coach-reply";
import { confirmErrorText } from "./messages";

export type { AppliedWeek };

/** Type what changed or what you want to know. The server works out what it means and
 * answers from the engine; nothing changes until a card is confirmed. */
export function CoachBox({
  weekIndex,
  blocked,
  onApplied,
  onBusyChange,
  onShowOptions,
}: {
  weekIndex: number;
  /** Why a change cannot be confirmed right now (an open draft), or null. */
  blocked: string | null;
  /** Blocked time changed: the board refetches and reports what moved. */
  onApplied: (weeks: AppliedWeek[]) => Promise<void> | void;
  /** True while a confirmed change is being saved, so the board can hold still. */
  onBusyChange?: (busy: boolean) => void;
  /** A reply points to the week's options: the board shows them again if they were dismissed. */
  onShowOptions?: () => void;
}) {
  const utils = api.useUtils();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [reply, setReply] = useState<CoachReply | null>(null);
  const [skipping, setSkipping] = useState<string | null>(null);

  const interpret = api.coach.interpret.useMutation({
    onSuccess: (r) => {
      setReply(r);
      setText("");
      if (r.kind === "rearrange" && r.state === "options") onShowOptions?.();
    },
  });
  // The card keeps its error; the board refetches so the athlete sees the current week.
  const refreshOnConflict = (code: string | undefined) => {
    if (code === "CONFLICT") void onApplied([]);
  };
  const block = api.schedule.setExceptions.useMutation({
    onSuccess: async (res) => {
      setReply(null);
      await onApplied(res.weeks);
    },
    onError: (err) => refreshOnConflict(err.data?.code),
  });
  const unblock = api.schedule.clearExceptions.useMutation({
    onSuccess: async () => {
      setReply(null);
      await onApplied([]);
    },
    onError: (err) => refreshOnConflict(err.data?.code),
  });
  const saving = block.isPending || unblock.isPending;
  const pending = interpret.isPending || saving;

  useEffect(() => {
    onBusyChange?.(saving);
  }, [saving, onBusyChange]);
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);

  // Closing the dialog without skipping leaves the card where it is, and the dialog
  // hands focus back to the Skip button itself.
  const closeSkip = useCallback(() => setSkipping(null), []);
  const skipApplied = useCallback(() => {
    setReply(null);
    void utils.schedule.invalidate();
    inputRef.current?.focus();
  }, [utils]);

  function send() {
    const trimmed = text.trim();
    if (trimmed === "" || pending) return;
    block.reset();
    unblock.reset();
    interpret.mutate({ weekIndex, text: trimmed });
  }

  function confirm(
    r: Extract<CoachFinalReply, { kind: "confirm_block" | "confirm_unblock" }>,
  ) {
    interpret.reset();
    if (r.kind === "confirm_block") block.mutate({ cells: r.cells });
    else unblock.mutate({ cells: r.cells });
  }

  const error = confirmErrorText(block.error ?? unblock.error);

  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex items-center gap-1 rounded-pill bg-sunken p-1 pl-4 transition-colors focus-within:bg-surface-raised focus-within:shadow-control"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          Tell the coach
        </label>
        <input
          id={inputId}
          ref={inputRef}
          type="text"
          value={text}
          maxLength={COACH_MAX_TEXT}
          onChange={(e) => setText(e.target.value)}
          placeholder="Tell the coach what changed, or ask about your week"
          readOnly={interpret.isPending}
          aria-busy={interpret.isPending}
          autoComplete="off"
          className="h-9 min-w-0 flex-1 bg-transparent text-body text-fg outline-none placeholder:text-fg-subtle"
        />
        <IconButton
          type="submit"
          icon={ArrowUp}
          aria-label={interpret.isPending ? "Thinking…" : "Send"}
          disabled={pending || text.trim() === ""}
          className="bg-ink! text-on-ink! hover:bg-ink-hover! hover:text-on-ink!"
        />
      </form>
      <div role="status" className="flex flex-col gap-3">
        {interpret.isError ? (
          <p className="text-card-desc text-fg-soft">
            {interpret.error.data?.code === "NOT_FOUND"
              ? "That week isn’t available."
              : "Something went wrong sending that. Try again."}
          </p>
        ) : null}
        {reply ? (
          <CoachReplyCard
            reply={reply}
            pending={pending}
            blocked={blocked}
            error={error}
            onConfirm={confirm}
            onSkip={setSkipping}
            onChoose={setReply}
            onDismiss={() => {
              interpret.reset();
              setReply(null);
            }}
          />
        ) : null}
      </div>
      {skipping !== null ? (
        <RescheduleDialog
          sessionId={skipping}
          open
          title="Skip this session?"
          onApplied={skipApplied}
          onClose={closeSkip}
        />
      ) : null}
    </div>
  );
}
