import type { DecisionFact } from "~/engine/facts";
import {
  savedLayout,
  scoreLayout,
  type Layout,
  type MoveSuggestion,
  type Placement,
  type ScheduleInput,
} from "~/engine/schedule";
import type { ScheduleMode } from "~/schema";
import type { SessionStatus, WeekDayView } from "~/views/types";

export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export interface ScheduleSessionView {
  id: string;
  label: string;
  estimatedMinutes: number;
  status: SessionStatus;
  locked: boolean;
}

export interface ScheduleWeekView {
  weekIndex: number;
  /** A past week: shown, not editable. */
  readOnly: boolean;
  mode: ScheduleMode;
  timezone: string;
  days: WeekDayView[];
  sessions: ScheduleSessionView[];
  /** Shipped so the browser can score drafts with the same engine code. */
  input: ScheduleInput;
  layout: Layout;
  warnings: string[];
}

export interface MoveSuggestionView {
  sessionId: string;
  swapWithSessionId: string | null;
  from: Placement;
  to: Placement;
  headline: string;
  reasons: string[];
}

export function placementLabel(p: Placement): string {
  const name = DAY_NAMES[p.day] ?? "?";
  return p.daypart ? `${name} ${p.daypart}` : name;
}

function muscleName(m: string): string {
  return m.replace(/_/g, " ").toLowerCase();
}

function restText(halfDays: number): string {
  if (halfDays % 2 === 0) {
    const days = halfDays / 2;
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  return `${halfDays} half-day${halfDays === 1 ? "" : "s"}`;
}

/** One schedule fact → one sentence. Deterministic: the engine supplies every number
 * (Law 2). Returns null for facts that are not about scheduling. */
export function phraseScheduleFact(fact: DecisionFact, label: (id: string) => string): string | null {
  switch (fact.kind) {
    case "short_rest":
      return fact.otherSessionId === null
        ? `${label(fact.sessionId)} is only ${restText(fact.gapHalfDays)} after last week's ${muscleName(fact.muscle)} work.`
        : `${label(fact.sessionId)} is only ${restText(fact.gapHalfDays)} after ${label(fact.otherSessionId)}, and both train ${muscleName(fact.muscle)}.`;
    case "load_streak":
      return `${fact.days} training days in a row.`;
    case "same_day_stack":
      return `${label(fact.sessionIds[0])} and ${label(fact.sessionIds[1])} are both on ${DAY_NAMES[fact.day] ?? "?"}.`;
    case "off_preference":
      return `${label(fact.sessionId)} isn't in one of your preferred times.`;
    case "uneven_spread":
      return `Sessions are bunched together, leaving a ${fact.longestGapDays}-day gap.`;
    case "on_blocked_cell":
      return `${label(fact.sessionId)} is on ${placementLabel({ day: fact.day, daypart: fact.daypart })}, which you've blocked.`;
    default:
      return null;
  }
}

export function toWarnings(facts: DecisionFact[], label: (id: string) => string): string[] {
  return facts.map((f) => phraseScheduleFact(f, label)).filter((t): t is string => t !== null);
}

export function toMoveSuggestionView(s: MoveSuggestion, label: (id: string) => string): MoveSuggestionView {
  const headline =
    s.swapWithSessionId === null
      ? `Move ${label(s.sessionId)} from ${placementLabel(s.from)} to ${placementLabel(s.to)}.`
      : `Swap ${label(s.sessionId)} (${placementLabel(s.from)}) with ${label(s.swapWithSessionId)} (${placementLabel(s.to)}).`;
  return {
    sessionId: s.sessionId,
    swapWithSessionId: s.swapWithSessionId,
    from: s.from,
    to: s.to,
    headline,
    // Both lists are facts of the current layout: gone after the move, then reduced by it.
    reasons: toWarnings([...s.resolves, ...s.eases], label),
  };
}

export function toScheduleWeekView(
  args: Omit<ScheduleWeekView, "layout" | "warnings" | "sessions"> & {
    sessions: Omit<ScheduleSessionView, "locked">[];
  },
): ScheduleWeekView {
  const layout = savedLayout(args.input);
  const label = (id: string) => args.sessions.find((s) => s.id === id)?.label ?? "Session";
  return {
    ...args,
    sessions: args.sessions.map((s) => ({ ...s, locked: s.status !== "SCHEDULED" })),
    layout,
    // A finished week cannot be changed, so a warning about it is noise.
    warnings: args.readOnly ? [] : toWarnings(scoreLayout(args.input, layout).facts, label),
  };
}
