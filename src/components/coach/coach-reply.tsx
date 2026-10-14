"use client";

import type { CoachFinalReply, CoachReply } from "~/views/coach";

const CARD =
  "rounded-card border-border-subtle bg-surface-raised flex flex-col gap-3 border p-4";
const PRIMARY =
  "rounded-control bg-accent text-nav hover:bg-accent-strong px-3 py-1.5 font-medium text-white transition-colors disabled:opacity-60";
const QUIET =
  "text-nav text-fg-muted hover:text-fg transition-colors disabled:opacity-60";

function Lines({ lines }: { lines: string[] }) {
  return (
    <ul className="text-nav text-fg-soft flex flex-col gap-1">
      {lines.map((l, i) => (
        <li key={`${i}:${l}`}>{l}</li>
      ))}
    </ul>
  );
}

/** One coach reply. Every string shown comes from the server's reply; this component adds
 * only fixed button labels. */
export function CoachReplyCard({
  reply,
  pending,
  blocked,
  error,
  onConfirm,
  onSkip,
  onChoose,
  onDismiss,
}: {
  reply: CoachReply;
  pending: boolean;
  /** Why a change cannot be confirmed right now, or null. */
  blocked: string | null;
  error: string | null;
  onConfirm: (
    reply: Extract<
      CoachFinalReply,
      { kind: "confirm_block" | "confirm_unblock" }
    >,
  ) => void;
  onSkip: (sessionId: string) => void;
  onChoose: (reply: CoachFinalReply) => void;
  onDismiss: () => void;
}) {
  return (
    <div className={CARD}>
      {reply.kind === "confirm_block" || reply.kind === "confirm_unblock" ? (
        <>
          <p className="text-card-title text-fg">{reply.summary}</p>
          {reply.kind === "confirm_block" && reply.alreadyBlocked.length > 0 ? (
            <p className="text-fg-muted text-[12px]">
              Already blocked: {reply.alreadyBlocked.join(", ")}.
            </p>
          ) : null}
          {reply.kind === "confirm_unblock" && reply.notes.length > 0 ? (
            <Lines lines={reply.notes} />
          ) : null}
          {blocked ? (
            <p className="text-fg-muted text-[12px]">{blocked}</p>
          ) : null}
          <div className="flex items-center gap-3">
            <button
              type="button"
              className={PRIMARY}
              aria-label={`Confirm: ${reply.summary}`}
              disabled={pending || blocked !== null}
              onClick={() => onConfirm(reply)}
            >
              Confirm
            </button>
            <button
              type="button"
              className={QUIET}
              disabled={pending}
              onClick={onDismiss}
            >
              Cancel
            </button>
          </div>
        </>
      ) : reply.kind === "skip" ? (
        <>
          <p className="text-card-title text-fg">{reply.summary}</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className={PRIMARY}
              disabled={pending}
              onClick={() => onSkip(reply.sessionId)}
            >
              Skip {reply.label}…
            </button>
            <button type="button" className={QUIET} onClick={onDismiss}>
              Cancel
            </button>
          </div>
        </>
      ) : reply.kind === "clarify" ? (
        <>
          <p className="text-card-title text-fg">{reply.question}</p>
          <div className="flex flex-wrap gap-2">
            {reply.choices.map((c, i) => (
              <button
                key={i}
                type="button"
                className="rounded-control border-border text-nav text-fg-soft hover:text-fg border px-3 py-1.5 transition-colors"
                onClick={() => onChoose(c.reply)}
              >
                {c.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={`${QUIET} self-start`}
            onClick={onDismiss}
          >
            Never mind
          </button>
        </>
      ) : (
        <>
          <Lines lines={reply.lines} />
          <button
            type="button"
            className={`${QUIET} self-start`}
            onClick={onDismiss}
          >
            Dismiss
          </button>
        </>
      )}
      {error ? <p className="text-nav text-fg-soft">{error}</p> : null}
    </div>
  );
}
