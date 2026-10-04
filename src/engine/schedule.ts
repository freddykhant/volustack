// src/engine/schedule.ts
import type { ExerciseDef } from "~/domain/exercise-library";
import type { Daypart, MuscleGroup, ScheduleMode } from "~/schema";
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
