"use client";

/** Shown while the athlete has unconfirmed moves. Nothing is saved until Confirm. */
export function DraftBar({
  changeCount,
  warnings,
  carryForward,
  onCarryForward,
  onDiscard,
  onConfirm,
  pending,
  stale,
  error,
}: {
  changeCount: number;
  warnings: string[];
  carryForward: boolean;
  onCarryForward: (v: boolean) => void;
  onDiscard: () => void;
  onConfirm: () => void;
  pending: boolean;
  /** The saved week changed elsewhere since this draft began: Confirm is off. */
  stale: boolean;
  error: string | null;
}) {
  return (
    <div
      className="rounded-card border-border bg-surface flex flex-col gap-3 border p-4"
      role="region"
      aria-label="Unsaved schedule changes"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-nav text-fg font-medium">
          {changeCount} unsaved {changeCount === 1 ? "change" : "changes"}
        </span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onDiscard}
            disabled={pending}
            className="text-nav text-fg-muted hover:text-fg transition-colors disabled:opacity-60"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending || stale}
            className="rounded-control bg-accent text-nav hover:bg-accent-strong px-4 py-2 font-medium text-white transition-colors disabled:opacity-60"
          >
            {pending ? "Saving…" : "Confirm"}
          </button>
        </div>
      </div>
      {stale ? (
        <p className="rounded-control border-border bg-callout text-nav text-fg-soft border px-3 py-2">
          This week changed somewhere else. Discard to see the latest.
        </p>
      ) : null}
      {warnings.length > 0 ? (
        <ul className="text-nav text-fg-soft flex flex-col gap-1">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : (
        <p className="text-nav text-fg-subtle">
          No recovery concerns with this layout.
        </p>
      )}
      <label className="text-nav text-fg-muted flex items-center gap-2">
        <input
          type="checkbox"
          checked={carryForward}
          onChange={(e) => onCarryForward(e.target.checked)}
          disabled={pending}
        />
        Use this layout for the remaining weeks
      </label>
      {error ? (
        <p className="rounded-control border-border bg-callout text-nav text-fg-soft border px-3 py-2">
          {error}
        </p>
      ) : null}
    </div>
  );
}
