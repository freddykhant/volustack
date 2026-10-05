import { SCHEDULE_EPS } from "~/engine/constants";
import {
  allCells,
  cellKey,
  checkLayout,
  layoutKey,
  samePlacement,
  scoreLayout,
  type Layout,
  type MoveSuggestion,
  type Placement,
  type ScheduleInput,
} from "~/engine/schedule";

export type TargetKind = "current" | "ok" | "warn" | "refused";

export interface DropTarget {
  placement: Placement;
  kind: TargetKind;
}

/** DOM-safe id for a cell: "3:PM", or "3:-" for a whole day. */
export function cellId(p: Placement): string {
  return `${p.day}:${p.daypart ?? "-"}`;
}

export function parseCellId(id: string): Placement {
  const [day, part] = id.split(":");
  return {
    day: Number(day),
    daypart: part === "AM" || part === "PM" ? part : null,
  };
}

/**
 * What a drop does to a draft layout. An empty cell takes the session (a cell holding
 * only a missed session counts as empty); an occupied cell swaps the two. Returns the SAME layout object when the drop is refused (locked
 * session, blocked or past cell, a swap the other session isn't allowed to make), so
 * callers can test `next === layout`. `input.sessions[].placement` must be the saved
 * placements: returning a session to where it is saved is always allowed.
 */
export function applyDrop(
  input: ScheduleInput,
  layout: Layout,
  sessionId: string,
  target: Placement,
): Layout {
  const session = input.sessions.find((s) => s.id === sessionId);
  if (!session || session.locked || session.inert) return layout;
  const from = layout[sessionId];
  if (samePlacement(from, target)) return layout;

  const key = cellKey(target, input.mode);
  // A missed session did not happen, so it does not hold its cell.
  const inertIds = new Set(input.sessions.filter((s) => s.inert).map((s) => s.id));
  const occupantId = Object.keys(layout).find(
    (id) =>
      id !== sessionId &&
      !inertIds.has(id) &&
      cellKey(layout[id]!, input.mode) === key,
  );

  let next: Layout;
  if (occupantId === undefined) {
    next = { ...layout, [sessionId]: target };
  } else {
    const occupant = input.sessions.find((s) => s.id === occupantId);
    if (!occupant || occupant.locked || occupant.inert || !from) return layout;
    next = { ...layout, [sessionId]: target, [occupantId]: from };
  }
  return checkLayout(input, next).length === 0 ? next : layout;
}

/** Sessions whose placement differs between the saved layout and a draft. */
export function changedIds(saved: Layout, draft: Layout): string[] {
  const ids = new Set([...Object.keys(saved), ...Object.keys(draft)]);
  return [...ids].filter((id) => !samePlacement(saved[id], draft[id])).sort();
}

/** Every cell, classified for one session: where it is, where it may go cleanly,
 * where it may go at a cost, and where it may not go. */
export function dropTargets(
  input: ScheduleInput,
  layout: Layout,
  sessionId: string,
): DropTarget[] {
  const placedNow = layout[sessionId] !== undefined;
  const base = scoreLayout(input, layout).cost;
  return allCells(input.mode).map((placement) => {
    if (samePlacement(layout[sessionId], placement))
      return { placement, kind: "current" as const };
    const next = applyDrop(input, layout, sessionId, placement);
    if (next === layout) return { placement, kind: "refused" as const };
    // Placing a not-yet-placed session always adds cost, so only compare for moves.
    const worse =
      placedNow && scoreLayout(input, next).cost > base + SCHEDULE_EPS;
    return { placement, kind: worse ? ("warn" as const) : ("ok" as const) };
  });
}

/** True when the saved layout is no longer the one a draft started from: the week
 * was changed somewhere else, so confirming the draft would overwrite that change. */
export function isDraftStale(base: Layout, saved: Layout): boolean {
  return layoutKey(base) !== layoutKey(saved);
}

/** A suggestion was computed against a saved layout. It may only be applied while that
 * part of the layout still holds: the session where it was, and for a swap the other
 * session where the first is going. */
export function suggestionStillValid(
  saved: Layout,
  s: Pick<MoveSuggestion, "sessionId" | "from" | "to" | "swapWithSessionId">,
): boolean {
  if (!samePlacement(saved[s.sessionId], s.from)) return false;
  return (
    s.swapWithSessionId === null ||
    samePlacement(saved[s.swapWithSessionId], s.to)
  );
}
