import { dayNumberOfIsoDate, weekdayOfDayNumber } from "~/domain/local-day";
import type { Placement, PlacementAlternative, PlacementExplanation } from "~/engine/schedule";
import type { ExceptionInput } from "~/schema";
import { DAY_NAMES, toWarnings } from "~/views/schedule";
import type { ReadinessLabel } from "~/views/types";

/** A reply that needs no further question. */
export type CoachFinalReply =
  | { kind: "confirm_block"; cells: ExceptionInput[]; summary: string; alreadyBlocked: string[] }
  | { kind: "confirm_unblock"; cells: ExceptionInput[]; summary: string; notes: string[] }
  | { kind: "skip"; sessionId: string; label: string; summary: string }
  | { kind: "rearrange"; state: "options" | "suggestion" | "nothing"; lines: string[] }
  | { kind: "answer"; topic: "week_issues" | "why_placement" | "next_session" | "recovery"; lines: string[] }
  | { kind: "note"; lines: string[] }
  | { kind: "unsupported"; lines: string[] }
  | { kind: "unavailable"; lines: string[] };

/** What the coach box shows. A clarify's choices are complete replies, so it never nests. */
export type CoachReply =
  | CoachFinalReply
  | { kind: "clarify"; question: string; choices: { label: string; reply: CoachFinalReply }[] };

export interface NextSessionInfo {
  label: string;
  placement: Placement | null;
  minutes: number;
  first: { exerciseName: string; sets: number; repLow: number; repHigh: number } | null;
}

export interface ReadinessInfo {
  fitness: number;
  fatigue: number;
  form: number;
  label: ReadinessLabel;
}

export const DAY_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** "Thu 15 Oct" for a "YYYY-MM-DD" calendar date. */
export function dateLabel(iso: string): string {
  const weekday = DAY_NAMES[weekdayOfDayNumber(dayNumberOfIsoDate(iso))] ?? "?";
  return `${weekday} ${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1] ?? "?"}`;
}

const HALF = { AM: "morning", PM: "afternoon" } as const;

export function cellLabel(cell: ExceptionInput): string {
  return cell.daypart ? `${dateLabel(cell.date)} (${HALF[cell.daypart]})` : dateLabel(cell.date);
}

export function placeName(p: Placement): string {
  const day = DAY_FULL[p.day] ?? "?";
  return p.daypart ? `${day} ${HALF[p.daypart]}` : day;
}

export function blockSummary(cells: ExceptionInput[]): string {
  return `Block ${joinList(cells.map(cellLabel))}?`;
}

export function unblockSummary(cells: ExceptionInput[]): string {
  return `Unblock ${joinList(cells.map(cellLabel))}?`;
}

export function skipSummary(label: string, placement: Placement | null): string {
  return placement ? `Skip ${label} on ${placeName(placement)} this week?` : `Skip ${label} this week?`;
}

/** A cost change this small is not worth telling the athlete about. */
const ABOUT_THE_SAME = 0.5;

function phraseAlternative(a: PlacementAlternative, label: (id: string) => string): string {
  const place = placeName(a.to);
  const problems = toWarnings([...a.adds, ...a.changes], label);
  if (a.delta > ABOUT_THE_SAME) {
    return problems.length > 0
      ? `If it moved to ${place}: ${problems.join(" ")}`
      : `${place} would space the week a little less evenly.`;
  }
  if (a.delta < -ABOUT_THE_SAME) return `${place} would be better.`;
  return `${place} would be about the same.`;
}

/** Why a session is where it is. Every clause comes from the explanation's own facts. */
export function phraseExplanation(ex: PlacementExplanation, label: (id: string) => string): string[] {
  const name = label(ex.sessionId);
  const lines = [`${name} is on ${placeName(ex.current)}.`];
  const now = toWarnings(ex.currentFacts, label);
  if (now.length > 0) lines.push(`Right now: ${now.join(" ")}`);
  if (ex.alternatives.length === 0) {
    lines.push("There is no other open time for it this week.");
    return lines;
  }
  for (const a of ex.alternatives) lines.push(phraseAlternative(a, label));
  if (ex.better) lines.push(`The engine would put it on ${placeName(ex.better.to)}.`);
  else if (ex.inSuggestion) lines.push("The board has a suggested change that involves it.");
  else lines.push("The engine sees no move worth making for it this week.");
  return lines;
}

export function phraseNextSession(next: NextSessionInfo | null): string[] {
  if (next === null) return ["Every session this week is done or missed."];
  if (next.placement === null) return [`Next up is ${next.label}. It isn't placed on a day yet.`];
  const lines = [`Next up is ${next.label} on ${placeName(next.placement)}, about ${next.minutes} minutes.`];
  if (next.first) {
    lines.push(`It starts with ${next.first.exerciseName}, ${next.first.sets} sets of ${next.first.repLow} to ${next.first.repHigh}.`);
  }
  return lines;
}

const one = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

/** Readiness as the model computed it. No advice: the label is the engine's own word. */
export function phraseRecovery(r: ReadinessInfo | null): string[] {
  if (r === null) return ["There isn't enough logged training yet to read your recovery."];
  return [`Your form reads ${r.label}.`, `Fitness ${one(r.fitness)}, fatigue ${one(r.fatigue)}, form ${one(r.form)}.`];
}

export function phraseWeekIssues(
  warnings: string[],
  suggestion: { headline: string; reasons: string[] } | null,
): string[] {
  if (warnings.length === 0 && suggestion === null) return ["No warnings this week."];
  return suggestion ? [...warnings, `Suggested: ${suggestion.headline}`] : [...warnings];
}

export const UNSUPPORTED_LINES = [
  "I can't help with that yet.",
  "I can block or unblock time, skip a session, re-arrange the week, and tell you what's wrong with the week, why a session is where it is, what's next, and how your recovery reads.",
];
export const UNAVAILABLE_LINES = ["I couldn't work that out just now. You can still block time from the board."];
export const LIMIT_LINES = ["You've reached today's limit for the coach. The board still works."];
export const FINISHED_WEEK_LINES = ["That week is over, so there is nothing to change in it."];
