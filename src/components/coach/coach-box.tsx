"use client";

import { useState } from "react";
import { RescheduleDialog } from "~/components/block/reschedule-dialog";
import { COACH_MAX_TEXT } from "~/schema";
import { api } from "~/trpc/react";
import type { CoachFinalReply, CoachReply } from "~/views/coach";
import type { AppliedWeek } from "./applied-notice";
import { CoachReplyCard } from "./coach-reply";

export type { AppliedWeek };

/** Type what changed or what you want to know. The server works out what it means and
 * answers from the engine; nothing changes until a card is confirmed. */
export function CoachBox({
  weekIndex,
  blocked,
  onApplied,
}: {
  weekIndex: number;
  /** Why a change cannot be confirmed right now (an open draft), or null. */
  blocked: string | null;
  /** Blocked time changed: the board refetches and reports what moved. */
  onApplied: (weeks: AppliedWeek[]) => Promise<void> | void;
}) {
  const utils = api.useUtils();
  const [text, setText] = useState("");
  const [reply, setReply] = useState<CoachReply | null>(null);
  const [skipping, setSkipping] = useState<string | null>(null);

  const interpret = api.coach.interpret.useMutation({
    onSuccess: (r) => {
      setReply(r);
      setText("");
    },
  });
  const block = api.schedule.setExceptions.useMutation({
    onSuccess: async (res) => {
      setReply(null);
      await onApplied(res.weeks);
    },
  });
  const unblock = api.schedule.clearExceptions.useMutation({
    onSuccess: async () => {
      setReply(null);
      await onApplied([]);
    },
  });
  const pending = interpret.isPending || block.isPending || unblock.isPending;

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
    if (r.kind === "confirm_block") block.mutate({ cells: r.cells });
    else unblock.mutate({ cells: r.cells });
  }

  const error = block.error?.message ?? unblock.error?.message ?? null;

  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <label htmlFor="coach-box" className="sr-only">
          Tell the coach
        </label>
        <input
          id="coach-box"
          type="text"
          value={text}
          maxLength={COACH_MAX_TEXT}
          onChange={(e) => setText(e.target.value)}
          placeholder="Tell the coach: can’t make Thursday, or ask why a session is where it is"
          disabled={interpret.isPending}
          autoComplete="off"
          className="rounded-control border-border-subtle bg-canvas text-nav text-fg placeholder:text-fg-subtle min-w-0 flex-1 border px-3 py-2"
        />
        <button
          type="submit"
          disabled={pending || text.trim() === ""}
          className="rounded-control border-border text-nav text-fg-soft hover:text-fg border px-3 py-2 font-medium transition-colors disabled:opacity-60"
        >
          {interpret.isPending ? "Thinking…" : "Send"}
        </button>
      </form>
      {interpret.isError ? (
        <p className="text-nav text-fg-soft" role="status">
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
          onDismiss={() => setReply(null)}
        />
      ) : null}
      {skipping !== null ? (
        <RescheduleDialog
          sessionId={skipping}
          open
          title="Skip this session?"
          onClose={() => {
            setSkipping(null);
            setReply(null);
            void utils.schedule.invalidate();
          }}
        />
      ) : null}
    </div>
  );
}
