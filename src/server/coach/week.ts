import type { CoachDate, CoachSession, CoachWeek } from "~/domain/coach/resolve";
import {
  dayIndex,
  explainPlacement,
  isStranded,
  placementPosition,
  proposeLayouts,
  savedLayout,
  scoreLayout,
  suggestMoves,
  type Placement,
} from "~/engine";
import type { WeekContext } from "~/server/schedule/week-context";
import type { CoachExplanation, NextSessionInfo, ReadinessAnswer } from "~/views/coach";
import { toMoveSuggestionView, toWarnings } from "~/views/schedule";
import { coachDates } from "./context";

/** Every date from the athlete's today to the block's last day, with how each half is blocked. */
export function weekDates(c: WeekContext, now: Date): CoachDate[] {
  return coachDates({
    startDate: c.startDate,
    lengthWeeks: c.lengthWeeks,
    timezone: c.settings.timezone,
    now,
    standing: c.settings.availability,
    exceptions: c.exceptions,
  });
}

/**
 * The athlete's week as the coach resolver needs it. Session keys S1…Sn follow board order.
 * `suggestionDismissed` is whether the athlete already dismissed the board's suggestion for
 * this layout; the coach then has none to relay either.
 */
export function coachWeekFrom(
  c: WeekContext,
  extras: { now: Date; readiness: ReadinessAnswer; suggestionDismissed: boolean },
): CoachWeek {
  const layout = savedLayout(c.input);
  const ordered = [...c.week.sessions].sort((a, b) => a.order - b.order);
  const sessions: CoachSession[] = ordered.map((s, i) => ({
    key: `S${i + 1}`,
    id: s.id,
    label: s.splitSlot,
    status: s.status,
    placement: layout[s.id] ?? null,
  }));

  const stranded = isStranded(c.input);
  // The one suggestion the board shows: none while stranded or once dismissed.
  const shown = stranded || extras.suggestionDismissed ? undefined : suggestMoves(c.input, layout)[0];
  const suggestion = shown ? toMoveSuggestionView(shown, c.label) : null;

  // The next session: the first still to train from today on, in the order the week lays
  // them out; then one left on a day that has passed; then one not placed yet.
  const rank = (p: Placement | undefined) =>
    p === undefined ? 2 : dayIndex(p.day, c.input.weekStartDay) < c.input.firstOpenDay ? 1 : 0;
  const upcoming = ordered
    .filter((s) => s.status === "SCHEDULED")
    .sort((a, b) => {
      const pa = layout[a.id];
      const pb = layout[b.id];
      if (!pa || !pb || rank(pa) !== rank(pb)) return rank(pa) - rank(pb) || a.order - b.order;
      return placementPosition(pa, c.input.weekStartDay) - placementPosition(pb, c.input.weekStartDay) || a.order - b.order;
    })[0];
  const firstPx = upcoming ? [...upcoming.prescriptions].sort((a, b) => a.order - b.order)[0] : undefined;
  // Without both rep targets there is nothing true to say about the first exercise.
  const repLow = firstPx?.targetRepLow ?? null;
  const repHigh = firstPx?.targetRepHigh ?? null;
  const first: NextSessionInfo["first"] =
    firstPx && repLow !== null && repHigh !== null
      ? { exerciseName: firstPx.exercise.name, sets: firstPx.sets, repLow, repHigh }
      : null;
  const next: NextSessionInfo | null = upcoming
    ? {
        label: upcoming.splitSlot,
        placement: layout[upcoming.id] ?? null,
        minutes: upcoming.targetDurationMin ?? 0,
        first,
        overdue: rank(layout[upcoming.id]) === 1,
      }
    : null;

  // What the coach says about a move must match the board: only the shown suggestion counts.
  const explain = (sessionId: string): CoachExplanation | null => {
    const ex = explainPlacement(c.input, layout, sessionId);
    if (ex === null) return null;
    const inShown = shown !== undefined && (shown.sessionId === sessionId || shown.swapWithSessionId === sessionId);
    return { ...ex, inSuggestion: inShown, suggestionHidden: ex.inSuggestion && !inShown };
  };

  return {
    mode: c.settings.mode,
    weekIndex: c.week.index,
    dates: weekDates(c, extras.now),
    sessions,
    stranded,
    hasOptions: stranded && proposeLayouts(c.input).length > 0,
    warnings: toWarnings(scoreLayout(c.input, layout).facts, c.label),
    suggestion: suggestion ? { headline: suggestion.headline, reasons: suggestion.reasons } : null,
    next,
    readiness: extras.readiness,
    explain,
  };
}
