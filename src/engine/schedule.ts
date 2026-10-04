// src/engine/schedule.ts
import type { ExerciseDef } from "~/domain/exercise-library";
import type { Daypart, MuscleGroup, ScheduleMode } from "~/schema";
import {
  MAX_STREAK_DAYS,
  OVERLAP_MIN_SETS,
  REST_TARGET_HALF_DAYS,
  SPREAD_FACT_MIN_DAYS,
  W_LOAD_STREAK,
  W_OFF_PREFERENCE,
  W_ON_BLOCKED_CELL,
  W_SAME_DAY_STACK,
  W_SHORT_REST,
  W_UNEVEN_SPREAD,
} from "./constants";
import type { DecisionFact } from "./facts";
import { ALL_MUSCLES, computeVolume, round1 } from "./util";

/** Where a session sits. `day` is 0=Mon…6=Sun; `daypart` is null in DAY mode. */
export interface Placement {
  day: number;
  daypart: Daypart | null;
}

/** A week's placements, keyed by session id. A session that is absent is unplaced. */
export type Layout = Record<string, Placement>;

/** Stimulus sets per muscle for one session. The discipline-agnostic input to scoring. */
export type Footprint = Partial<Record<MuscleGroup, number>>;

export interface ScheduleSession {
  id: string;
  order: number;
  footprint: Footprint;
  /** COMPLETED or MISSED: cannot be moved. */
  locked: boolean;
  /** The placement currently saved; `checkLayout` treats any difference as a move. */
  placement: Placement | null;
}

export interface AvailabilityCellInput {
  day: number;
  daypart: Daypart;
  state: "PREFERRED" | "BLOCKED";
}

/** A session from the end of the previous week, for rest across the week boundary. */
export interface CarryIn {
  footprint: Footprint;
  halfDaysBeforeWeekStart: number; // ≥ 1
}

export interface ScheduleInput {
  mode: ScheduleMode;
  /** Weekday (0=Mon) of the rolling week's first day. */
  weekStartDay: number;
  sessions: ScheduleSession[];
  availability: AvailabilityCellInput[];
  carryIn: CarryIn[];
  /** Index (0..7) of the first day in the week that is not in the past. 7 = whole week past. */
  firstOpenDay: number;
}

export type HardViolationKind =
  | "blocked_cell"
  | "occupied"
  | "day_limit"
  | "in_past"
  | "locked"
  | "mode_mismatch"
  | "unknown_session";

export interface HardViolation {
  kind: HardViolationKind;
  sessionId: string;
}

/** A weekday's index (0..6) within a rolling week that starts on `weekStartDay`. */
export function dayIndex(day: number, weekStartDay: number): number {
  return (day - weekStartDay + 7) % 7;
}

/** Half-days from the start of the rolling week (0..13). A null daypart counts as AM. */
export function placementPosition(p: Placement, weekStartDay: number): number {
  return dayIndex(p.day, weekStartDay) * 2 + (p.daypart === "PM" ? 1 : 0);
}

export function samePlacement(a: Placement | null | undefined, b: Placement | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  return a.day === b.day && a.daypart === b.daypart;
}

/** Every cell a session could occupy in this mode, Monday first. */
export function allCells(mode: ScheduleMode): Placement[] {
  const out: Placement[] = [];
  for (let day = 0; day < 7; day++) {
    if (mode === "DAY") out.push({ day, daypart: null });
    else out.push({ day, daypart: "AM" }, { day, daypart: "PM" });
  }
  return out;
}

/** Identity of the cell a placement occupies: the day in DAY mode, the half-day otherwise. */
export function cellKey(p: Placement, mode: ScheduleMode): string {
  return mode === "DAY" ? String(p.day) : `${p.day}:${p.daypart ?? "AM"}`;
}

/** Availability of a cell. In DAY mode a day is Blocked only when both halves are,
 * and Preferred when either half is. */
export function cellState(
  availability: AvailabilityCellInput[],
  mode: ScheduleMode,
  p: Placement,
): "PREFERRED" | "AVAILABLE" | "BLOCKED" {
  const of = (dp: Daypart) => availability.find((c) => c.day === p.day && c.daypart === dp)?.state ?? "AVAILABLE";
  if (mode === "HALF_DAY") return of(p.daypart ?? "AM");
  const am = of("AM");
  const pm = of("PM");
  if (am === "BLOCKED" && pm === "BLOCKED") return "BLOCKED";
  if (am === "PREFERRED" || pm === "PREFERRED") return "PREFERRED";
  return "AVAILABLE";
}

function isOpenTarget(input: ScheduleInput, p: Placement): boolean {
  return (
    cellState(input.availability, input.mode, p) !== "BLOCKED" &&
    dayIndex(p.day, input.weekStartDay) >= input.firstOpenDay
  );
}

/** Cells a session may be moved into: not Blocked, not in the past. Position order. */
export function openCells(input: ScheduleInput): Placement[] {
  return allCells(input.mode)
    .filter((c) => isOpenTarget(input, c))
    .sort((a, b) => placementPosition(a, input.weekStartDay) - placementPosition(b, input.weekStartDay));
}

/** The half a session takes when a day-only placement becomes AM/PM. */
export function daypartForDay(availability: AvailabilityCellInput[], day: number): Daypart {
  const of = (dp: Daypart) => availability.find((c) => c.day === day && c.daypart === dp)?.state ?? "AVAILABLE";
  const am = of("AM");
  const pm = of("PM");
  if (pm === "PREFERRED" && am !== "PREFERRED") return "PM";
  if (am === "BLOCKED" && pm !== "BLOCKED") return "PM";
  return "AM";
}

/** Stimulus sets per muscle for a session, using the library's fractional credit. */
export function footprintOf(
  prescriptions: { exerciseName: string; sets: number }[],
  library: ExerciseDef[],
): Footprint {
  const vol = computeVolume(prescriptions, library);
  const out: Footprint = {};
  for (const m of ALL_MUSCLES) {
    if (vol[m] > 0) out[m] = round1(vol[m]);
  }
  return out;
}

/** The layout currently saved, read off the sessions. */
export function savedLayout(input: ScheduleInput): Layout {
  const out: Layout = {};
  for (const s of input.sessions) {
    if (s.placement) out[s.id] = s.placement;
  }
  return out;
}

/** A stable identity for a layout, independent of key order. */
export function layoutKey(layout: Layout): string {
  return Object.keys(layout)
    .sort()
    .map((id) => `${id}:${layout[id]!.day}:${layout[id]!.daypart ?? "-"}`)
    .join("|");
}

/**
 * Hard rules. These judge MOVES, not standing state: a session already sitting on a
 * Blocked or past cell is not a violation until someone tries to put it there. Two
 * locked sessions are never reported against each other, so history left in an older
 * shape (after a mode switch) cannot make every later move in the week fail.
 */
export function checkLayout(input: ScheduleInput, layout: Layout): HardViolation[] {
  const out: HardViolation[] = [];
  const known = new Set(input.sessions.map((s) => s.id));
  const placed = [...input.sessions].sort((a, b) => a.order - b.order).filter((s) => layout[s.id] !== undefined);

  for (const s of placed) {
    const p = layout[s.id]!;
    const moved = !samePlacement(s.placement, p);
    if (s.locked) {
      if (moved) out.push({ kind: "locked", sessionId: s.id });
      continue;
    }
    if ((p.daypart !== null) !== (input.mode === "HALF_DAY")) {
      out.push({ kind: "mode_mismatch", sessionId: s.id });
    }
    if (moved) {
      if (cellState(input.availability, input.mode, p) === "BLOCKED") {
        out.push({ kind: "blocked_cell", sessionId: s.id });
      }
      if (dayIndex(p.day, input.weekStartDay) < input.firstOpenDay) {
        out.push({ kind: "in_past", sessionId: s.id });
      }
    }
  }

  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i]!;
      const b = placed[j]!;
      if (a.locked && b.locked) continue;
      const pa = layout[a.id]!;
      const pb = layout[b.id]!;
      if (pa.day !== pb.day) continue;
      const offender = b.locked ? a : b;
      if (input.mode === "DAY") out.push({ kind: "day_limit", sessionId: offender.id });
      else if ((pa.daypart ?? "AM") === (pb.daypart ?? "AM")) out.push({ kind: "occupied", sessionId: offender.id });
    }
  }

  for (const id of Object.keys(layout)) {
    if (!known.has(id)) out.push({ kind: "unknown_session", sessionId: id });
  }
  return out;
}

export interface LayoutScore {
  cost: number;
  facts: DecisionFact[];
}

/** Shared stimulus between two footprints, and the muscle that shares most. */
function overlapOf(a: Footprint, b: Footprint): { sets: number; muscle: MuscleGroup | null } {
  let sets = 0;
  let top: MuscleGroup | null = null;
  let topSets = 0;
  for (const m of ALL_MUSCLES) {
    const shared = Math.min(a[m] ?? 0, b[m] ?? 0);
    sets += shared;
    if (shared > topSets) {
      topSets = shared;
      top = m;
    }
  }
  return { sets: round1(sets), muscle: top };
}

/**
 * Cost of a layout plus the facts that explain it. Lower is better. Every term is
 * non-negative. Reads footprints and placements only: it never touches a set count
 * (Law 1) and every reason it gives is a fact (Law 2).
 */
export function scoreLayout(input: ScheduleInput, layout: Layout): LayoutScore {
  const facts: DecisionFact[] = [];
  let cost = 0;

  const placed = [...input.sessions]
    .sort((a, b) => a.order - b.order)
    .filter((s) => layout[s.id] !== undefined)
    .map((s) => {
      const p = layout[s.id]!;
      return { s, p, pos: placementPosition(p, input.weekStartDay) };
    });

  const rest = (sessionId: string, otherSessionId: string | null, a: Footprint, b: Footprint, gap: number) => {
    const o = overlapOf(a, b);
    if (o.muscle === null || o.sets < OVERLAP_MIN_SETS || gap >= REST_TARGET_HALF_DAYS) return;
    cost += W_SHORT_REST * o.sets * (REST_TARGET_HALF_DAYS - gap);
    facts.push({
      kind: "short_rest",
      sessionId,
      otherSessionId,
      muscle: o.muscle,
      gapHalfDays: gap,
      targetHalfDays: REST_TARGET_HALF_DAYS,
    });
  };

  // Rest between sessions in this week.
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i]!;
      const b = placed[j]!;
      const [earlier, later] = a.pos <= b.pos ? [a, b] : [b, a];
      rest(later.s.id, earlier.s.id, a.s.footprint, b.s.footprint, Math.abs(a.pos - b.pos));
    }
  }

  // Rest across the week boundary.
  for (const c of input.carryIn) {
    for (const x of placed) {
      rest(x.s.id, null, c.footprint, x.s.footprint, c.halfDaysBeforeWeekStart + x.pos);
    }
  }

  const days = [...new Set(placed.map((x) => Math.floor(x.pos / 2)))].sort((a, b) => a - b);

  // Consecutive training days.
  let longest = 0;
  let run = 0;
  let prev = -2;
  for (const d of days) {
    run = d === prev + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  if (longest > MAX_STREAK_DAYS) {
    cost += W_LOAD_STREAK * (longest - MAX_STREAK_DAYS);
    facts.push({ kind: "load_streak", days: longest, limit: MAX_STREAK_DAYS });
  }

  // Two sessions on one day.
  if (input.mode === "HALF_DAY") {
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i]!;
        const b = placed[j]!;
        if (a.p.day !== b.p.day) continue;
        const shared = overlapOf(a.s.footprint, b.s.footprint).sets;
        cost += W_SAME_DAY_STACK * (1 + shared);
        facts.push({ kind: "same_day_stack", day: a.p.day, sessionIds: [a.s.id, b.s.id], sharedSets: shared });
      }
    }
  }

  // Preference and blocked cells.
  const occupied = new Set(placed.map((x) => cellKey(x.p, input.mode)));
  const preferredOpen = allCells(input.mode).some(
    (c) =>
      cellState(input.availability, input.mode, c) === "PREFERRED" &&
      dayIndex(c.day, input.weekStartDay) >= input.firstOpenDay &&
      !occupied.has(cellKey(c, input.mode)),
  );
  for (const x of placed) {
    if (x.s.locked) continue;
    const state = cellState(input.availability, input.mode, x.p);
    if (state === "BLOCKED") {
      cost += W_ON_BLOCKED_CELL;
      facts.push({ kind: "on_blocked_cell", sessionId: x.s.id, day: x.p.day, daypart: x.p.daypart });
    } else if (state !== "PREFERRED" && preferredOpen) {
      cost += W_OFF_PREFERENCE;
      facts.push({ kind: "off_preference", sessionId: x.s.id });
    }
  }

  // Spread across the week, treating the week as repeating.
  if (days.length >= 2) {
    const gaps = days.map((d, i) => (i === days.length - 1 ? days[0]! + 7 - d : days[i + 1]! - d));
    const ideal = 7 / days.length;
    cost += W_UNEVEN_SPREAD * gaps.reduce((sum, g) => sum + Math.abs(g - ideal), 0);
    const longestGap = Math.max(...gaps);
    const shortestGap = Math.min(...gaps);
    if (longestGap - shortestGap >= SPREAD_FACT_MIN_DAYS) {
      facts.push({ kind: "uneven_spread", longestGapDays: longestGap, shortestGapDays: shortestGap });
    }
  }

  return { cost: Math.round(cost * 1e6) / 1e6, facts };
}
