"use client";

import { useDraggable } from "@dnd-kit/core";
import type { Placement } from "~/engine/schedule";
import type { ScheduleSessionView } from "~/views/schedule";
import { parseCellId } from "./draft";

export interface MoveOption {
  value: string; // cellId
  label: string;
}

/** One session on the board. Pointer and touch users drag the top half; keyboard and
 * screen-reader users use the "Move to…" menu, which offers the same legal targets. */
export function SessionChip({
  session,
  editable,
  changed,
  moveOptions,
  onMove,
}: {
  session: ScheduleSessionView;
  editable: boolean;
  changed: boolean;
  moveOptions: MoveOption[];
  onMove: (target: Placement) => void;
}) {
  const draggable = editable && !session.locked;
  const { listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: session.id,
    disabled: !draggable,
  });
  const status =
    session.status === "COMPLETED"
      ? "Done"
      : session.status === "MISSED"
        ? "Missed"
        : null;

  return (
    <div
      ref={setNodeRef}
      style={
        transform
          ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
          : undefined
      }
      className={[
        "rounded-control bg-surface-raised border p-2",
        changed ? "border-accent" : "border-border-subtle",
        isDragging ? "relative z-10 opacity-80" : "",
        session.locked ? "opacity-70" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div
        {...(draggable ? listeners : {})}
        className={
          draggable ? "cursor-grab touch-manipulation select-none" : undefined
        }
      >
        <div className="text-nav text-fg font-medium">{session.label}</div>
        <div className="text-fg-subtle text-[12px]">
          {session.estimatedMinutes} min{status ? ` · ${status}` : ""}
          {changed ? " · Moved" : ""}
        </div>
      </div>
      {draggable && moveOptions.length > 0 ? (
        <select
          aria-label={`Move ${session.label} to another time`}
          value=""
          onChange={(e) => {
            if (e.target.value) onMove(parseCellId(e.target.value));
          }}
          className="rounded-control border-border-subtle bg-canvas text-fg-muted mt-1.5 w-full border px-1 py-0.5 text-[12px]"
        >
          <option value="">Move to…</option>
          {moveOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}
