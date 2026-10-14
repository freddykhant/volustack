// src/engine/schedule.ts
import type { ExerciseDef } from "~/domain/exercise-library";
import type { Daypart, MuscleGroup, ScheduleMode } from "~/schema";
import {
  MAX_LAYOUT_OPTIONS,
  MAX_STREAK_DAYS,
  MAX_SUGGESTIONS,
  OVERLAP_MIN_SETS,
  PREFERENCE_LENS_FACTOR,
  REST_TARGET_HALF_DAYS,
  SCHEDULE_EPS,
  SPREAD_FACT_MIN_DAYS,
  SUGGESTION_MIN_GAIN,
  W_DISPLACEMENT,
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
  /**
   * Did not and will not happen (MISSED): kept in the layout so the board can show it, but
   * it trains nothing. It is never moved, is not scored, and does not take its cell or day.
   */
  inert: boolean;
  /** The placement currently saved; `checkLayout` treats any difference as a move. */
  placement: Placement | null;
}

export interface AvailabilityCellInput {
  day: number;
  daypart: Daypart;
  state: "PREFERRED" | "BLOCKED";
  /** Set when the cell is blocked for this week only (an exception), not by the standing grid. */
  oneOff?: boolean;
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

/** A session that cannot be moved: completed, or inert (missed). */
function isFixed(s: ScheduleSession): boolean {
  return s.locked || s.inert;
}

/** Identities of the cells held by sessions that really train: an inert session holds none. */
function heldCells(input: ScheduleInput, layout: Layout): Set<string> {
  const held = new Set<string>();
  for (const s of input.sessions) {
    const p = layout[s.id];
    if (p !== undefined && !s.inert) held.add(cellKey(p, input.mode));
  }
  return held;
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
 * Blocked or past cell is not a violation until someone tries to put it there. Likewise a
 * pair sharing a day or half-day is reported only when at least one of the two moved (and
 * the mover is blamed), so a pair left that way by a mode switch cannot make every later move
 * in the week fail. Two locked sessions are never reported against each other, and a session
 * that did not happen (inert) collides with nothing.
 */
export function checkLayout(input: ScheduleInput, layout: Layout): HardViolation[] {
  const out: HardViolation[] = [];
  const known = new Set(input.sessions.map((s) => s.id));
  const placed = [...input.sessions].sort((a, b) => a.order - b.order).filter((s) => layout[s.id] !== undefined);

  for (const s of placed) {
    const p = layout[s.id]!;
    const moved = !samePlacement(s.placement, p);
    if (isFixed(s)) {
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

  // A session that did not happen takes nothing, so it cannot collide with anything.
  const live = placed.filter((s) => !s.inert);
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i]!;
      const b = live[j]!;
      if (a.locked && b.locked) continue;
      const pa = layout[a.id]!;
      const pb = layout[b.id]!;
      if (pa.day !== pb.day) continue;
      // A pair already sharing a cell or day is standing state, not a move: report it only
      // when one of the two moved, and blame the one that did.
      const movedA = !samePlacement(a.placement, pa);
      const movedB = !samePlacement(b.placement, pb);
      if (!movedA && !movedB) continue;
      const offender = movedA && movedB ? (b.locked ? a : b) : movedA ? a : b;
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

  // Inert (missed) sessions did not happen: they take no part in any term.
  const placed = [...input.sessions]
    .sort((a, b) => a.order - b.order)
    .filter((s) => !s.inert && layout[s.id] !== undefined)
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

export type PlaceResult = { kind: "placed"; layout: Layout } | { kind: "infeasible"; facts: DecisionFact[] };

export interface MoveSuggestion {
  sessionId: string;
  from: Placement;
  to: Placement;
  /** Set when the move is a swap: this session takes `from`. */
  swapWithSessionId: string | null;
  gain: number;
  /** Facts of the current layout whose identity is absent after the change: the problem is gone. */
  resolves: DecisionFact[];
  /**
   * Facts of the current layout whose identity is still present after the change but whose
   * content differs: the problem remains, changed (a gap lengthened but still short, say).
   * A fact that is unchanged by the move is in neither list.
   */
  eases: DecisionFact[];
}

interface Neighbour {
  layout: Layout;
  sessionId: string;
  from: Placement;
  to: Placement;
  swapWithSessionId: string | null;
}

/**
 * What a fact is about, independent of its numbers: the same pair of sessions being too
 * close, the same session being off preference. Two facts with one identity describe the
 * same problem even when a move changes its size.
 */
function factIdentity(f: DecisionFact): string {
  switch (f.kind) {
    case "short_rest":
      return `short_rest:${[f.sessionId, f.otherSessionId ?? "prev-week"].sort().join("+")}`;
    case "same_day_stack":
      return `same_day_stack:${[...f.sessionIds].sort().join("+")}`;
    case "off_preference":
      return `off_preference:${f.sessionId}`;
    case "on_blocked_cell":
      return `on_blocked_cell:${f.sessionId}`;
    case "load_streak":
      return "load_streak";
    case "uneven_spread":
      return "uneven_spread";
    default:
      return `${(f as DecisionFact).kind}:${JSON.stringify(f)}`;
  }
}

/** A fact's content, with the order of a session pair ignored (it flips with relative position). */
function factContent(f: DecisionFact): string {
  if (f.kind === "short_rest") {
    const pair = [f.sessionId, f.otherSessionId ?? "prev-week"].sort();
    return JSON.stringify({ ...f, sessionId: pair[0], otherSessionId: pair[1] });
  }
  if (f.kind === "same_day_stack") return JSON.stringify({ ...f, sessionIds: [...f.sessionIds].sort() });
  return JSON.stringify(f);
}

/** Layout after a move or swap. */
export function applySuggestion(
  layout: Layout,
  s: Pick<MoveSuggestion, "sessionId" | "from" | "to" | "swapWithSessionId">,
): Layout {
  const next: Layout = { ...layout, [s.sessionId]: s.to };
  if (s.swapWithSessionId !== null) next[s.swapWithSessionId] = s.from;
  return next;
}

/**
 * Every legal single change to a layout: an unlocked session moving to an empty open
 * cell, or two unlocked sessions trading places. Generated in a fixed order (session
 * order, then cell position, then swaps) so ties always resolve the same way.
 */
function neighbours(input: ScheduleInput, layout: Layout): Neighbour[] {
  const movable = [...input.sessions]
    .sort((a, b) => a.order - b.order)
    .filter((s) => !isFixed(s) && layout[s.id] !== undefined);
  const occupied = heldCells(input, layout);
  const cells = openCells(input);
  const out: Neighbour[] = [];

  for (const s of movable) {
    const from = layout[s.id]!;
    for (const to of cells) {
      if (occupied.has(cellKey(to, input.mode))) continue;
      out.push({ layout: { ...layout, [s.id]: to }, sessionId: s.id, from, to, swapWithSessionId: null });
    }
  }
  for (let i = 0; i < movable.length; i++) {
    for (let j = i + 1; j < movable.length; j++) {
      const a = movable[i]!;
      const b = movable[j]!;
      const pa = layout[a.id]!;
      const pb = layout[b.id]!;
      if (!isOpenTarget(input, pa) || !isOpenTarget(input, pb)) continue;
      out.push({ layout: { ...layout, [a.id]: pb, [b.id]: pa }, sessionId: a.id, from: pa, to: pb, swapWithSessionId: b.id });
    }
  }
  return out;
}

/** Guard against a runaway loop; each step strictly lowers cost, so this is never reached in practice. */
const LOCAL_SEARCH_MAX_STEPS = 200;

/** The weighting a layout was searched under. */
export type Lens = "BALANCED" | "FEWEST_CHANGES" | "KEEPS_PREFERENCES";

export const LENS_ORDER: readonly Lens[] = ["BALANCED", "FEWEST_CHANGES", "KEEPS_PREFERENCES"];

/**
 * A layout's cost as one lens sees it. Every lens starts from `scoreLayout`, so the hard
 * preferences (blocked cells, rest) still count; a lens only adds weight to one concern.
 */
export function lensCost(input: ScheduleInput, layout: Layout, lens: Lens): number {
  const score = scoreLayout(input, layout);
  if (lens === "FEWEST_CHANGES") {
    const moved = input.sessions.filter(
      (s) => !isFixed(s) && s.placement !== null && layout[s.id] !== undefined && !samePlacement(s.placement, layout[s.id]),
    ).length;
    return score.cost + W_DISPLACEMENT * moved;
  }
  if (lens === "KEEPS_PREFERENCES") {
    const off = score.facts.filter((f) => f.kind === "off_preference").length;
    return score.cost + (PREFERENCE_LENS_FACTOR - 1) * W_OFF_PREFERENCE * off;
  }
  return score.cost;
}

/**
 * Where a search starts. Fixed sessions always keep their placement. With `keepStanding`,
 * so does every other session whose saved cell is still open and not already taken, so the
 * search only has to find homes for the sessions that were displaced.
 */
function seedLayout(input: ScheduleInput, keepStanding: boolean): Layout {
  const seed: Layout = {};
  for (const s of input.sessions) {
    if (isFixed(s) && s.placement) seed[s.id] = s.placement;
  }
  if (!keepStanding) return seed;
  const held = heldCells(input, seed);
  for (const s of [...input.sessions].sort((a, b) => a.order - b.order)) {
    if (isFixed(s) || !s.placement || !isOpenTarget(input, s.placement)) continue;
    // A day-only placement in AM/PM mode (or the reverse) has to be re-placed.
    if ((s.placement.daypart !== null) !== (input.mode === "HALF_DAY")) continue;
    const key = cellKey(s.placement, input.mode);
    if (held.has(key)) continue;
    seed[s.id] = s.placement;
    held.add(key);
  }
  return seed;
}

/**
 * Greedy construction in session order (each unseeded session takes the open cell that
 * costs least, earliest on ties), then local search over `neighbours` until no single
 * move or swap lowers the cost. Deterministic.
 */
function searchLayout(input: ScheduleInput, costOf: (layout: Layout) => number, seed: Layout): PlaceResult {
  let layout: Layout = { ...seed };
  const toPlace = [...input.sessions]
    .sort((a, b) => a.order - b.order)
    .filter((s) => !isFixed(s) && layout[s.id] === undefined);
  const cells = openCells(input);

  for (const s of toPlace) {
    const occupied = heldCells(input, layout);
    let best: Placement | null = null;
    let bestCost = Infinity;
    for (const c of cells) {
      if (occupied.has(cellKey(c, input.mode))) continue;
      const cost = costOf({ ...layout, [s.id]: c });
      if (cost < bestCost - SCHEDULE_EPS) {
        best = c;
        bestCost = cost;
      }
    }
    if (best === null) {
      const taken = new Set(
        input.sessions.filter((x) => x.locked && !x.inert && x.placement).map((x) => cellKey(x.placement!, input.mode)),
      );
      const open = cells.filter((c) => !taken.has(cellKey(c, input.mode))).length;
      const needed = input.sessions.filter((x) => !isFixed(x)).length;
      return {
        kind: "infeasible",
        facts: [{ kind: "infeasible", constraint: "schedule_cells", detail: { needed, open } }],
      };
    }
    layout = { ...layout, [s.id]: best };
  }

  for (let step = 0; step < LOCAL_SEARCH_MAX_STEPS; step++) {
    let bestCost = costOf(layout);
    let bestLayout: Layout | null = null;
    for (const n of neighbours(input, layout)) {
      const cost = costOf(n.layout);
      if (cost < bestCost - SCHEDULE_EPS) {
        bestCost = cost;
        bestLayout = n.layout;
      }
    }
    if (bestLayout === null) break;
    layout = bestLayout;
  }

  return { kind: "placed", layout };
}

/**
 * Auto-place a week. Locked and inert sessions stay put; every other session is (re)placed.
 * Greedy construction in session order (each takes the open cell that costs least,
 * earliest on ties), then local search over `neighbours` until no single move or swap
 * lowers the cost. Deterministic. Because it stops at a local optimum of the same
 * neighbourhood `suggestMoves` searches, a freshly placed week has no suggestion.
 */
export function placeWeek(input: ScheduleInput): PlaceResult {
  return searchLayout(input, (layout) => scoreLayout(input, layout).cost, seedLayout(input, false));
}

/**
 * Place a week as one lens would. BALANCED is `placeWeek`. FEWEST_CHANGES starts from the
 * saved layout and pays for every session it moves. KEEPS_PREFERENCES re-places everything
 * with preferred times weighted up.
 */
export function placeWithLens(input: ScheduleInput, lens: Lens): PlaceResult {
  return searchLayout(input, (layout) => lensCost(input, layout, lens), seedLayout(input, lens === "FEWEST_CHANGES"));
}

/**
 * The single moves or swaps that most improve a layout. Starts from the layout the
 * athlete chose rather than the engine's ideal, so each suggestion is a small tweak
 * with a reason. Empty when nothing clears the threshold.
 *
 * `resolves` and `eases` both list facts of the CURRENT layout, compared by identity
 * (see `factIdentity`): `resolves` when the problem is gone after the change, `eases`
 * when it remains but differs. A fact the move leaves unchanged is in neither.
 */
export function suggestMoves(input: ScheduleInput, layout: Layout): MoveSuggestion[] {
  const base = scoreLayout(input, layout);
  return neighbours(input, layout)
    .map((n, index) => {
      const after = scoreLayout(input, n.layout);
      return { n, index, after, gain: base.cost - after.cost };
    })
    .filter((x) => x.gain > SUGGESTION_MIN_GAIN)
    .sort((a, b) => b.gain - a.gain || a.index - b.index)
    .slice(0, MAX_SUGGESTIONS)
    .map((x) => {
      const afterByIdentity = new Map<string, Set<string>>();
      for (const f of x.after.facts) {
        const id = factIdentity(f);
        const contents = afterByIdentity.get(id) ?? new Set<string>();
        contents.add(factContent(f));
        afterByIdentity.set(id, contents);
      }
      const resolves: DecisionFact[] = [];
      const eases: DecisionFact[] = [];
      for (const f of base.facts) {
        const same = afterByIdentity.get(factIdentity(f));
        if (same === undefined) resolves.push(f);
        else if (!same.has(factContent(f))) eases.push(f);
      }
      return {
        sessionId: x.n.sessionId,
        from: x.n.from,
        to: x.n.to,
        swapWithSessionId: x.n.swapWithSessionId,
        gain: Math.round(x.gain * 1e6) / 1e6,
        resolves,
        eases,
      };
    });
}

export interface LayoutMove {
  sessionId: string;
  from: Placement | null;
  to: Placement;
}

export type OverflowOutcome =
  | { kind: "skip"; sessionId: string }
  | { kind: "double_up"; sessionId: string; day: number };

/** One way to arrange the week, with what it changes and what it leaves the athlete with. */
export interface LayoutOption {
  /** Unique within one result: a lens name, "DOUBLE_UP", "SKIP_1" or "SKIP_2". */
  id: string;
  lens: Lens;
  /** Placements of every session the option keeps. Skipped sessions are absent. */
  layout: Layout;
  moves: LayoutMove[];
  score: LayoutScore;
  /** Why the week is crowded; empty when it is not. */
  fit: DecisionFact[];
  /** Names the first affected session only; `skipped` is the complete list of what the option leaves out. */
  overflow: OverflowOutcome | null;
  skipped: string[];
}

/** Live fixed sessions: they happened (or will, where they are), so they hold their day. */
function liveFixed(input: ScheduleInput): ScheduleSession[] {
  return input.sessions.filter((s) => s.locked && !s.inert && s.placement !== null);
}

/** Days that still have an open cell and no completed session on them. */
export function freeDayCount(input: ScheduleInput): number {
  const heldDays = new Set(liveFixed(input).map((s) => s.placement!.day));
  return new Set(openCells(input).map((c) => c.day).filter((d) => !heldDays.has(d))).size;
}

function freeCellCount(input: ScheduleInput): number {
  const held = new Set(liveFixed(input).map((s) => cellKey(s.placement!, input.mode)));
  return openCells(input).filter((c) => !held.has(cellKey(c, input.mode))).length;
}

/** A session the athlete could still train is standing on time they have blocked. */
export function isStranded(input: ScheduleInput): boolean {
  return scoreLayout(input, savedLayout(input)).facts.some((f) => f.kind === "on_blocked_cell");
}

/**
 * The same week with every overdue session held where it is. A session is overdue when it
 * could still be moved but its saved day has passed and was not blocked: the athlete may
 * have trained it without logging, so re-placement neither moves it nor counts it. A session
 * left on a past day that was blocked could not have been trained there and stays movable.
 */
function holdOverdue(input: ScheduleInput): ScheduleInput {
  const overdue = (s: ScheduleSession) =>
    !isFixed(s) &&
    s.placement !== null &&
    dayIndex(s.placement.day, input.weekStartDay) < input.firstOpenDay &&
    cellState(input.availability, input.mode, s.placement) !== "BLOCKED";
  if (!input.sessions.some(overdue)) return input;
  return { ...input, sessions: input.sessions.map((s) => (overdue(s) ? { ...s, locked: true } : s)) };
}

/** More sessions left to train than days left to train them on. Overdue sessions are not counted. */
export function isCrowded(input: ScheduleInput): boolean {
  const held = holdOverdue(input);
  return held.sessions.filter((s) => !isFixed(s)).length > freeDayCount(held);
}

/**
 * When a week is crowded, which sessions should be offered for skipping first?
 * Returns the candidates' ids, most skippable first. Must return each candidate exactly
 * once, be deterministic and never throw; `proposeLayouts` repairs a wrong list of ids but
 * does not catch an exception.
 *
 * TODO(product owner): this is a coaching call. The placeholder skips the last session
 * of the week first. Alternatives: the smallest footprint, the session whose muscles are
 * trained again soonest, or the session standing on the blocked time.
 */
export function nominateOverflow(input: ScheduleInput, candidates: ScheduleSession[]): string[] {
  return [...candidates].sort((a, b) => b.order - a.order).map((s) => s.id);
}

/** The same week with some sessions treated as not happening. */
function withoutSessions(input: ScheduleInput, ids: string[]): ScheduleInput {
  const gone = new Set(ids);
  return { ...input, sessions: input.sessions.map((s) => (gone.has(s.id) ? { ...s, inert: true } : s)) };
}

function buildOption(
  input: ScheduleInput,
  id: string,
  lens: Lens,
  skipped: string[],
  fit: DecisionFact[],
): LayoutOption | null {
  const reduced = withoutSessions(input, skipped);
  const res = placeWithLens(reduced, lens);
  if (res.kind !== "placed") return null;
  const gone = new Set(skipped);
  const layout: Layout = {};
  for (const [sid, p] of Object.entries(res.layout)) {
    if (!gone.has(sid)) layout[sid] = p;
  }
  const moves: LayoutMove[] = [...input.sessions]
    .sort((a, b) => a.order - b.order)
    .filter((s) => !isFixed(s) && !gone.has(s.id) && layout[s.id] !== undefined && !samePlacement(s.placement, layout[s.id]))
    .map((s) => ({ sessionId: s.id, from: s.placement, to: layout[s.id]! }));
  return {
    id,
    lens,
    layout,
    moves,
    score: scoreLayout(reduced, res.layout),
    fit,
    overflow: skipped.length > 0 ? { kind: "skip", sessionId: skipped[0]! } : null,
    skipped,
  };
}

/** Identity of an option's outcome: what it skips and where everything else goes. */
function optionKey(o: LayoutOption): string {
  return `${[...o.skipped].sort().join(",")}#${layoutKey(o.layout)}`;
}

/**
 * Up to MAX_LAYOUT_OPTIONS distinct ways to arrange the week, in the engine's order of
 * preference. In a roomy week each option is the same search under a different lens.
 * In a crowded week the options are the athlete's real choices: keep everything by
 * doubling up (AM/PM mode only), or skip a session. Never changes a prescription, and
 * never returns an option `checkLayout` would refuse. An overdue session (see `holdOverdue`)
 * keeps its placement in every option and is never moved or skipped. Deterministic.
 */
export function proposeLayouts(week: ScheduleInput): LayoutOption[] {
  const input = holdOverdue(week);
  const movable = input.sessions.filter((s) => !isFixed(s));
  if (movable.length === 0) return [];
  const out: LayoutOption[] = [];
  const seen = new Set<string>();
  const push = (o: LayoutOption | null) => {
    if (o === null) return;
    const key = optionKey(o);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(o);
  };

  const freeDays = freeDayCount(input);
  const overDays = movable.length - freeDays;

  if (overDays <= 0) {
    for (const lens of LENS_ORDER) push(buildOption(input, lens, lens, [], []));
    const balanced = (o: LayoutOption) => lensCost(input, o.layout, "BALANCED");
    return out
      .filter((o) => o.moves.length > 0)
      .map((o, index) => ({ o, index, cost: balanced(o) }))
      .sort((a, b) => a.cost - b.cost || a.index - b.index)
      .map((x) => x.o)
      .slice(0, MAX_LAYOUT_OPTIONS);
  }

  // Crowded. Repair the ranking so a faulty nomination can never lose or invent a session.
  const ids = movable.map((s) => s.id);
  const nominated = nominateOverflow(input, movable).filter((id, i, all) => ids.includes(id) && all.indexOf(id) === i);
  const ranked = [...nominated, ...ids.filter((id) => !nominated.includes(id))];
  const fitFor = (sessionId: string): DecisionFact[] => [
    { kind: "session_does_not_fit", sessionId, sessions: movable.length, freeDays },
  ];

  // Doubling up keeps every session, so it is only on offer when they all fit in the open cells.
  if (input.mode === "HALF_DAY" && movable.length <= freeCellCount(input)) {
    const o = buildOption(input, "DOUBLE_UP", "BALANCED", [], fitFor(ranked[0]!));
    if (o !== null) {
      const movableIds = new Set(movable.map((s) => s.id));
      const movedIds = new Set(o.moves.map((m) => m.sessionId));
      const stacks = o.score.facts.filter(
        (f): f is Extract<DecisionFact, { kind: "same_day_stack" }> =>
          f.kind === "same_day_stack" && f.sessionIds.some((id) => movableIds.has(id)),
      );
      const stack = stacks.find((f) => f.sessionIds.some((id) => movedIds.has(id))) ?? stacks[0];
      if (stack !== undefined) {
        const mover =
          stack.sessionIds.find((id) => movedIds.has(id)) ?? stack.sessionIds.find((id) => movableIds.has(id))!;
        push({ ...o, overflow: { kind: "double_up", sessionId: mover, day: stack.day } });
      }
    }
  }

  const primary = ranked.slice(0, overDays);
  push(buildOption(input, "SKIP_1", "BALANCED", primary, fitFor(primary[0]!)));
  if (overDays === 1 && ranked.length >= 2) {
    push(buildOption(input, "SKIP_2", "BALANCED", [ranked[1]!], fitFor(ranked[1]!)));
  }
  return out.slice(0, MAX_LAYOUT_OPTIONS);
}

export interface PlacementAlternative {
  to: Placement;
  /**
   * Cost change if the session moved there: positive is worse. It can be non-zero with
   * `adds`, `worsens` and `resolves` all empty, when the only difference is the week's
   * spread cost, which is below the threshold for a fact.
   */
  delta: number;
  /** Problems naming this session, or the whole week, that the move would create and the current layout does not have. */
  adds: DecisionFact[];
  /** Problems naming this session, or the whole week, that remain after the move and would be worse, as they would be after it. */
  worsens: DecisionFact[];
  /** Problems naming this session, or the whole week, in the current layout that the move would remove. */
  resolves: DecisionFact[];
}

export interface PlacementExplanation {
  sessionId: string;
  current: Placement;
  /** Facts of the current layout that name this session. */
  currentFacts: DecisionFact[];
  /** The nearest free cell before and after the current one, each compared. */
  alternatives: PlacementAlternative[];
  /** The single move of this session the engine would suggest, or null when none clears the suggestion bar. */
  better: PlacementAlternative | null;
  /** No single move of this session into a free cell is worth suggesting. */
  isBest: boolean;
  /** A current board suggestion (a move or a swap) involves this session. */
  inSuggestion: boolean;
}

/** How bad a fact is, higher meaning worse, for comparing two facts of one identity. Null when the kind has no size. */
function factSeverity(f: DecisionFact): number | null {
  switch (f.kind) {
    case "short_rest":
      return -f.gapHalfDays;
    case "load_streak":
      return f.days;
    case "same_day_stack":
      return f.sharedSets;
    case "uneven_spread":
      return f.longestGapDays - f.shortestGapDays;
    default:
      return null;
  }
}

/** The sessions a schedule fact is about. Week-wide facts name none. */
function factSessionIds(f: DecisionFact): string[] {
  switch (f.kind) {
    case "short_rest":
      return f.otherSessionId === null ? [f.sessionId] : [f.sessionId, f.otherSessionId];
    case "same_day_stack":
      return [...f.sessionIds];
    case "off_preference":
    case "on_blocked_cell":
      return [f.sessionId];
    default:
      return [];
  }
}

/**
 * Why a session is where it is, as a comparison: what the nearest free time before and
 * after it would cost, in the same facts the board warns with. Reads placements and
 * footprints only. Null for a session that cannot move or is not on the board.
 */
export function explainPlacement(input: ScheduleInput, layout: Layout, sessionId: string): PlacementExplanation | null {
  const session = input.sessions.find((s) => s.id === sessionId);
  const current = layout[sessionId];
  if (!session || current === undefined || isFixed(session)) return null;

  const base = scoreLayout(input, layout);
  const byIdentity = (facts: DecisionFact[]) => {
    const out = new Map<string, DecisionFact[]>();
    for (const f of facts) {
      const id = factIdentity(f);
      out.set(id, [...(out.get(id) ?? []), f]);
    }
    return out;
  };
  const baseFacts = byIdentity(base.facts);
  const here = placementPosition(current, input.weekStartDay);
  const held = heldCells(input, layout);
  const free = openCells(input).filter((c) => !held.has(cellKey(c, input.mode)));
  // Only problems about this session or the whole week belong to its explanation.
  const mine = (f: DecisionFact) => {
    const ids = factSessionIds(f);
    return ids.length === 0 || ids.includes(sessionId);
  };

  const compare = (to: Placement, after: LayoutScore): PlacementAlternative => {
    const afterFacts = byIdentity(after.facts);
    return {
      to,
      delta: Math.round((after.cost - base.cost) * 1e6) / 1e6,
      adds: after.facts.filter((f) => mine(f) && !baseFacts.has(factIdentity(f))),
      worsens: after.facts.filter((f) => {
        const severity = factSeverity(f);
        const was = (baseFacts.get(factIdentity(f)) ?? []).map(factSeverity);
        // Worse than every current fact of its identity, so a size that only moved sideways is not a cost.
        return mine(f) && severity !== null && was.length > 0 && was.every((w) => w !== null && severity > w);
      }),
      resolves: base.facts.filter((f) => mine(f) && !afterFacts.has(factIdentity(f))),
    };
  };

  const scored = free.map((c) => ({ cell: c, score: scoreLayout(input, { ...layout, [sessionId]: c }) }));
  const earlier = scored.filter((x) => placementPosition(x.cell, input.weekStartDay) < here).at(-1);
  const later = scored.find((x) => placementPosition(x.cell, input.weekStartDay) > here);
  const alternatives = [earlier, later].filter((x) => x !== undefined).map((x) => compare(x.cell, x.score));

  // The lowest-cost free cell, the earliest on a tie, offered only when it clears the bar the board uses.
  let lowest: (typeof scored)[number] | null = null;
  for (const x of scored) {
    if (lowest === null || x.score.cost < lowest.score.cost - SCHEDULE_EPS) lowest = x;
  }
  const better =
    lowest !== null && base.cost - lowest.score.cost > SUGGESTION_MIN_GAIN ? compare(lowest.cell, lowest.score) : null;

  return {
    sessionId,
    current: { ...current },
    currentFacts: base.facts.filter((f) => factSessionIds(f).includes(sessionId)),
    alternatives,
    better,
    isBest: better === null,
    inSuggestion: suggestMoves(input, layout).some(
      (m) => m.sessionId === sessionId || m.swapWithSessionId === sessionId,
    ),
  };
}
