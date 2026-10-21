"use client";

import { Button, Panel } from "~/components/ui-kit/app-shell-kit";
import type { CoachFinalReply, CoachReply } from "~/views/coach";

function Lines({ lines }: { lines: string[] }) {
  return (
    <ul className="flex flex-col gap-1 text-card-desc text-fg-muted">
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
    <Panel padding="sm" className="animate-rise flex flex-col gap-3">
      {reply.kind === "confirm_block" || reply.kind === "confirm_unblock" ? (
        <>
          <p className="text-card-title text-fg">{reply.summary}</p>
          {reply.kind === "confirm_block" && reply.alreadyBlockedLine ? (
            <p className="text-meta text-fg-muted">
              {reply.alreadyBlockedLine}
            </p>
          ) : null}
          {reply.kind === "confirm_unblock" && reply.notes.length > 0 ? (
            <Lines lines={reply.notes} />
          ) : null}
          {blocked ? (
            <p className="text-meta text-fg-muted">{blocked}</p>
          ) : null}
          <div className="flex items-center gap-2">
            <Button
              variant="accent"
              size="sm"
              aria-label={`Confirm: ${reply.summary}`}
              disabled={pending || blocked !== null}
              onClick={() => onConfirm(reply)}
            >
              Confirm
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={onDismiss}
            >
              Cancel
            </Button>
          </div>
        </>
      ) : reply.kind === "skip" ? (
        <>
          <p className="text-card-title text-fg">{reply.summary}</p>
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              disabled={pending}
              onClick={() => onSkip(reply.sessionId)}
            >
              Skip {reply.label}…
            </Button>
            <Button variant="ghost" size="sm" onClick={onDismiss}>
              Cancel
            </Button>
          </div>
        </>
      ) : reply.kind === "clarify" ? (
        <>
          <p className="text-card-title text-fg">{reply.question}</p>
          <div className="flex flex-wrap gap-2">
            {reply.choices.map((c, i) => (
              <Button
                key={i}
                variant="secondary"
                size="sm"
                onClick={() => onChoose(c.reply)}
              >
                {c.label}
              </Button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={onDismiss}
          >
            Never mind
          </Button>
        </>
      ) : (
        <>
          <Lines lines={reply.lines} />
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={onDismiss}
          >
            Dismiss
          </Button>
        </>
      )}
      {error ? <p className="text-card-desc text-fg-soft">{error}</p> : null}
    </Panel>
  );
}
