import type { Placement, PlacementExplanation } from "~/engine/schedule";
import type { CoachIntentForm, ExceptionInput, ScheduleMode } from "~/schema";
import {
  blockSummary,
  cellLabel,
  dateLabel,
  phraseExplanation,
  phraseNextSession,
  phraseRecovery,
  phraseWeekIssues,
  skipSummary,
  unblockSummary,
  UNSUPPORTED_LINES,
  type CoachFinalReply,
  type CoachReply,
  type NextSessionInfo,
  type ReadinessInfo,
} from "~/views/coach";

/** How a half-day is blocked, if it is. */
export type BlockSource = "standing" | "one_off" | null;

export interface CoachDate {
  date: string; // "YYYY-MM-DD"
  weekday: number; // 0 = Mon … 6 = Sun
  weekIndex: number;
  am: BlockSource;
  pm: BlockSource;
}

export interface CoachSession {
  key: string; // "S1": the stand-in the model sees
  id: string;
  label: string;
  status: "SCHEDULED" | "COMPLETED" | "MISSED";
  placement: Placement | null;
}

/** Everything the resolver needs about the athlete's week, as plain data. */
export interface CoachWeek {
  mode: ScheduleMode;
  weekIndex: number;
  /** Every date from today to the block's last day, ascending. The only dates a form may use. */
  dates: CoachDate[];
  /** The viewed week's sessions, in board order. */
  sessions: CoachSession[];
  stranded: boolean;
  warnings: string[];
  suggestion: { headline: string; reasons: string[] } | null;
  next: NextSessionInfo | null;
  readiness: ReadinessInfo | null;
  explain: (sessionId: string) => PlacementExplanation | null;
}

type Half = "AM" | "PM";
const HALVES: Half[] = ["AM", "PM"];
const sourceOf = (d: CoachDate, half: Half): BlockSource => (half === "AM" ? d.am : d.pm);
const whole = (date: string): ExceptionInput => ({ date, daypart: null });
const note = (...lines: string[]): CoachFinalReply => ({ kind: "note", lines });

/**
 * The halves the form asks about, per allowed date, in date order. Dates the model was
 * never offered are dropped here, so nothing after this point can see one. In one-a-day
 * mode a half-day means the day.
 */
function wantedHalves(form: CoachIntentForm, week: CoachWeek): { day: CoachDate; halves: Half[] }[] {
  const byDate = new Map(week.dates.map((d) => [d.date, d]));
  const wanted = new Map<string, Set<Half>>();
  for (const d of form.dates) {
    if (!byDate.has(d.date)) continue;
    const set = wanted.get(d.date) ?? new Set<Half>();
    if (week.mode === "DAY" || d.daypart === null) HALVES.forEach((h) => set.add(h));
    else set.add(d.daypart);
    wanted.set(d.date, set);
  }
  return week.dates
    .filter((d) => wanted.has(d.date))
    .map((d) => ({ day: d, halves: HALVES.filter((h) => wanted.get(d.date)!.has(h)) }));
}

/** One cell for a set of halves on a date: the whole day when both, else the half. */
function cellFor(date: string, halves: Half[]): ExceptionInput {
  return halves.length === 2 ? whole(date) : { date, daypart: halves[0]! };
}

function blockReply(asked: { day: CoachDate; halves: Half[] }[], week: CoachWeek): CoachFinalReply | null {
  const cells: ExceptionInput[] = [];
  const already: string[] = [];
  for (const { day, halves } of asked) {
    if (week.mode === "DAY") {
      // A day is blocked only when both halves are; otherwise the whole day is still to block.
      if (day.am !== null && day.pm !== null) already.push(dateLabel(day.date));
      else cells.push(whole(day.date));
      continue;
    }
    const open = halves.filter((h) => sourceOf(day, h) === null);
    const blocked = halves.filter((h) => sourceOf(day, h) !== null);
    if (open.length > 0) cells.push(cellFor(day.date, open));
    if (blocked.length > 0) already.push(cellLabel(cellFor(day.date, blocked)));
  }
  if (cells.length > 0) return { kind: "confirm_block", cells, summary: blockSummary(cells), alreadyBlocked: already };
  if (already.length > 0) return note(...already.map((a) => `${a} is already blocked.`));
  return null;
}

function unblockReply(asked: { day: CoachDate; halves: Half[] }[], week: CoachWeek): CoachFinalReply | null {
  const cells: ExceptionInput[] = [];
  const settings: string[] = [];
  const open: string[] = [];
  const inSettings = (label: string) => `${label} is blocked in your standing availability. Change that in Settings.`;
  for (const { day, halves } of asked) {
    if (week.mode === "DAY") {
      // A day is blocked only when both halves are; one open half leaves the day unblocked.
      const label = dateLabel(day.date);
      if (day.am === null || day.pm === null) open.push(label);
      else if (day.am === "one_off" || day.pm === "one_off") cells.push(whole(day.date));
      else settings.push(inSettings(label));
      continue;
    }
    const oneOff = halves.filter((h) => sourceOf(day, h) === "one_off");
    const standing = halves.filter((h) => sourceOf(day, h) === "standing");
    const free = halves.filter((h) => sourceOf(day, h) === null);
    if (oneOff.length > 0) cells.push(cellFor(day.date, oneOff));
    if (standing.length > 0) settings.push(inSettings(cellLabel(cellFor(day.date, standing))));
    if (free.length > 0) open.push(cellLabel(cellFor(day.date, free)));
  }
  const notes = [...settings, ...open.map((o) => `${o} isn't blocked.`)];
  if (cells.length > 0) return { kind: "confirm_unblock", cells, summary: unblockSummary(cells), notes };
  if (notes.length > 0) return note(...notes);
  return null;
}

/** A clarify with at least one choice, or the fallback when there is nothing to choose from. */
function clarify(question: string, choices: { label: string; reply: CoachFinalReply }[], fallback: CoachFinalReply): CoachReply {
  return choices.length > 0 ? { kind: "clarify", question, choices } : fallback;
}

function whyReply(session: CoachSession, week: CoachWeek): CoachFinalReply {
  const lines =
    session.status === "COMPLETED"
      ? [`${session.label} is already done, so it stays where it was.`]
      : session.status === "MISSED"
        ? [`${session.label} was missed, so it stays where it was.`]
        : session.placement === null
          ? [`${session.label} isn't placed on a day yet.`]
          : (() => {
              const label = (id: string) => week.sessions.find((s) => s.id === id)?.label ?? "Session";
              try {
                const ex = week.explain(session.id);
                if (ex) return phraseExplanation(ex, label);
              } catch {
                // fall through to the line below
              }
              return [`${session.label} can't be moved right now.`];
            })();
  return { kind: "answer", topic: "why_placement", lines };
}

function skipReply(session: CoachSession): CoachFinalReply {
  if (session.status === "COMPLETED") return note(`${session.label} is already done.`);
  if (session.status === "MISSED") return note(`${session.label} was already missed.`);
  return { kind: "skip", sessionId: session.id, label: session.label, summary: skipSummary(session.label, session.placement) };
}

const answer = (topic: "week_issues" | "next_session" | "recovery", lines: string[]): CoachFinalReply => ({
  kind: "answer",
  topic,
  lines,
});

/**
 * Turn the model's intent form into what the coach box shows. Everything in the form is
 * checked against the week here: a date the athlete cannot use, a half-day in one-a-day
 * mode, or a session that is not theirs never reaches a reply. Pure, and never throws.
 */
export function resolveCoachForm(form: CoachIntentForm, week: CoachWeek): CoachReply {
  const session = form.sessionKey === null ? undefined : week.sessions.find((s) => s.key === form.sessionKey);
  const scheduled = week.sessions.filter((s) => s.status === "SCHEDULED");
  const thisWeek = week.dates.filter((d) => d.weekIndex === week.weekIndex);
  const nothingLeft = week.sessions.length === 0 ? note("This week has no sessions.") : note("Every session this week is done or missed.");

  switch (form.intent) {
    case "block_time": {
      const asked = wantedHalves(form, week);
      const reply = blockReply(asked, week);
      if (reply) return reply;
      if (thisWeek.length === 0) return note("There are no days left in this week to block.");
      const choices = thisWeek
        .map((d) => ({ label: dateLabel(d.date), reply: blockReply([{ day: d, halves: HALVES }], week) }))
        .filter((c): c is { label: string; reply: CoachFinalReply } => c.reply?.kind === "confirm_block");
      return clarify("Which day can't you train?", choices, note("Every remaining day this week is already blocked."));
    }
    case "unblock_time": {
      const asked = wantedHalves(form, week);
      const reply = unblockReply(asked, week);
      if (reply) return reply;
      const choices = thisWeek
        .map((d) => ({ label: dateLabel(d.date), reply: unblockReply([{ day: d, halves: HALVES }], week) }))
        .filter((c): c is { label: string; reply: CoachFinalReply } => c.reply?.kind === "confirm_unblock");
      return clarify("Which blocked time should I open up?", choices, note("Nothing is blocked just for this week."));
    }
    case "skip_session": {
      if (session) return skipReply(session);
      if (scheduled.length === 1) return skipReply(scheduled[0]!);
      return clarify(
        "Which session do you want to skip?",
        scheduled.map((s) => ({ label: s.label, reply: skipReply(s) })),
        nothingLeft,
      );
    }
    case "rearrange_week": {
      if (week.stranded) {
        return { kind: "rearrange", state: "options", lines: ["A session is on time you've blocked. Your options are just below."] };
      }
      if (week.suggestion) {
        return {
          kind: "rearrange",
          state: "suggestion",
          lines: [week.suggestion.headline, ...week.suggestion.reasons, "You can accept it on the board below."],
        };
      }
      return { kind: "rearrange", state: "nothing", lines: ["The engine has no change to suggest for this week."] };
    }
    case "ask_week_issues":
      return answer("week_issues", phraseWeekIssues(week.warnings, week.suggestion));
    case "ask_why_placement": {
      if (session) return whyReply(session, week);
      if (scheduled.length === 1) return whyReply(scheduled[0]!, week);
      return clarify(
        "Which session do you mean?",
        scheduled.map((s) => ({ label: s.label, reply: whyReply(s, week) })),
        nothingLeft,
      );
    }
    case "ask_next_session":
      return answer("next_session", phraseNextSession(week.next));
    case "ask_recovery":
      return answer("recovery", phraseRecovery(week.readiness));
    case "unclear":
      return {
        kind: "clarify",
        question: "I didn't catch that. Did you mean one of these?",
        choices: [
          { label: "What's wrong with my week?", reply: answer("week_issues", phraseWeekIssues(week.warnings, week.suggestion)) },
          { label: "What's next?", reply: answer("next_session", phraseNextSession(week.next)) },
          { label: "How's my recovery?", reply: answer("recovery", phraseRecovery(week.readiness)) },
        ],
      };
    case "out_of_scope":
      return { kind: "unsupported", lines: UNSUPPORTED_LINES };
    default: {
      // Adding an intent without a case above is a type error here.
      const exhaustive: never = form.intent;
      void exhaustive;
      return { kind: "unsupported", lines: UNSUPPORTED_LINES };
    }
  }
}
