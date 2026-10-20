"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Ban, Info, RotateCw, TriangleAlert, Wand2 } from "lucide-react";
import { coachAppliedNotice } from "~/components/coach/applied-notice";
import { CoachBox, type AppliedWeek } from "~/components/coach/coach-box";
import { blockedReason } from "~/components/coach/messages";
import {
  applySuggestion,
  cellKey,
  cellState,
  isStranded,
  placeWeek,
  scoreLayout,
  type Layout,
  type Placement,
  type ScheduleInput,
} from "~/engine/schedule";
import { api } from "~/trpc/react";
import {
  DAY_NAMES,
  placementLabel,
  toWarnings,
  type MoveSuggestionView,
  type ReplacementOptionView,
} from "~/views/schedule";
import {
  applyDrop,
  cellId,
  changedIds,
  dropTargets,
  isDraftStale,
  optionStillValid,
  parseCellId,
  suggestionStillValid,
  type DropTarget,
} from "./draft";
import { Button, Callout } from "~/components/ui-kit/app-shell-kit";
import { BoardSkeleton } from "./board-skeleton";
import { DraftBar } from "./draft-bar";
import { blockState } from "./exceptions";
import { ReplacementPanel } from "./replacement-panel";
import { SessionChip, type MoveOption } from "./session-chip";
import { SuggestionCard } from "./suggestion-card";

/** A draft carries what it started from, so a refetch or another device's change can
 * neither shift it underneath the athlete nor slip past the server's conflict check. */
interface Draft {
  layout: Layout;
  base: Layout;
  input: ScheduleInput;
}

/** `availabilityLink` is set only for the one notice that Availability settings can fix. */
interface Notice {
  text: string;
  availabilityLink: boolean;
  /** Later weeks that changed or need a choice; each links to its board. */
  weekLinks?: number[];
}

function BlockToggle({
  state,
  label,
  disabled,
  onToggle,
}: {
  state: "open" | "one_off";
  label: string;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={state === "one_off"}
      aria-label={`Can’t train ${label}`}
      disabled={disabled}
      onClick={onToggle}
      className="text-meta h-6 rounded-pill px-2 font-medium text-fg-subtle transition-colors hover:bg-hover hover:text-fg disabled:pointer-events-none disabled:opacity-45"
    >
      {state === "one_off" ? "Undo" : "Can’t train"}
    </button>
  );
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** The athlete's calendar date ("YYYY-MM-DD") in their own timezone. */
function localToday(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat("en-CA").format(new Date());
  }
}

/** "2026-10-21" → "21 Oct". */
function shortDate(iso: string): string {
  return `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
}

/** A soft line under the main area: one callout style for every board message. */
function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="animate-fade">
      <Callout icon={Info}>{children}</Callout>
    </div>
  );
}

const LINK = "font-medium text-accent transition-colors hover:text-accent-strong";

function Cell({
  placement,
  target,
  showHalf,
  blocked,
  note,
  toggle,
  children,
}: {
  placement: Placement;
  target: DropTarget | undefined;
  showHalf: boolean;
  blocked: boolean;
  note?: string;
  toggle?: React.ReactNode;
  children: React.ReactNode;
}) {
  const refused = target?.kind === "refused";
  // Refused cells stay registered: a drop on one must resolve to that cell (and be a
  // no-op in the board's move), not fall through to whichever enabled cell is nearest.
  const { setNodeRef, isOver } = useDroppable({ id: cellId(placement) });
  const tone = !target
    ? blocked
      ? "border-dashed border-border-strong"
      : "border-transparent bg-sunken"
    : refused
      ? blocked
        ? "border-dashed border-border-strong opacity-40"
        : "border-transparent bg-sunken opacity-40"
      : target.kind === "warn"
        ? "border-dashed border-border-strong bg-sunken"
        : "border-accent/25 bg-selection";
  const over = isOver && !refused;
  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-14 min-w-0 flex-col gap-2 rounded-callout border p-2 transition-[background-color,border-color,box-shadow,opacity] duration-200 ease-out ${tone} ${over ? "bg-selection ring-2 ring-accent" : ""}`}
    >
      {showHalf || blocked || note || toggle ? (
        <div className="flex min-h-6 items-center gap-2 px-1.5">
          {showHalf ? (
            <span className="text-eyebrow font-medium text-fg-subtle">
              {placement.daypart}
            </span>
          ) : null}
          {blocked ? (
            <span
              title="Blocked"
              className="text-meta inline-flex items-center gap-1 text-fg-subtle"
            >
              <Ban className="size-3.5" aria-hidden />
              Blocked
            </span>
          ) : null}
          {note ? (
            <span className="text-meta text-fg-subtle">
              {blocked ? "· " : ""}
              {note}
            </span>
          ) : null}
          {toggle ? <span className="ml-auto">{toggle}</span> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

/** The week as a board: one column per date, sessions as chips. Moves are a local
 * draft scored in the browser by the same engine code the server re-runs on Confirm. */
export function ScheduleBoard({ weekIndex }: { weekIndex: number }) {
  const router = useRouter();
  const utils = api.useUtils();
  const query = api.schedule.getWeekSchedule.useQuery({ weekIndex });
  const coach = api.coach.status.useQuery();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [carryForward, setCarryForward] = useState(false);
  const [coachBusy, setCoachBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [dismissedOptions, setDismissedOptions] = useState<string | null>(null);
  const tzSynced = useRef(false);

  const refresh = () => {
    void utils.schedule.invalidate();
    router.refresh();
  };
  const setTimezone = api.schedule.setTimezone.useMutation({
    onSuccess: refresh,
  });
  const apply = api.schedule.applyLayout.useMutation({
    // React Query awaits this before the mutation settles, so the board stays
    // non-editable until the fresh layout is in: no flicker back to the old cells.
    onSuccess: async (res) => {
      await utils.schedule.invalidate();
      router.refresh();
      setDraft(null);
      setCarryForward(false);
      setNotice(
        res.skipped.length > 0
          ? {
              text: `Saved. Week ${res.skipped.map((s) => s.weekIndex).join(", ")} kept its own layout.`,
              availabilityLink: false,
            }
          : null,
      );
    },
    onError: (err) => {
      if (err.data?.code === "CONFLICT") refresh();
    },
  });
  // Only the week itself is awaited: the options query may wait on the coach's verdict,
  // and the board should not stay locked for that.
  const onExceptionChange = async () => {
    await utils.schedule.getWeekSchedule.invalidate();
    void utils.schedule.getReplacementOptions.invalidate();
    void utils.schedule.getSuggestions.invalidate();
    router.refresh();
  };
  const setException = api.schedule.setException.useMutation({
    onSuccess: async (res) => {
      await onExceptionChange();
      setNotice(
        res.moved.length > 0
          ? {
              text: `Re-arranged: ${res.moved.join(", ")}.`,
              availabilityLink: false,
            }
          : null,
      );
    },
    onError: (err) => setNotice({ text: err.message, availabilityLink: false }),
  });
  const clearException = api.schedule.clearException.useMutation({
    onSuccess: async () => {
      await onExceptionChange();
      setNotice(null);
    },
    onError: (err) => setNotice({ text: err.message, availabilityLink: false }),
  });
  async function onCoachApplied(weeks: AppliedWeek[]) {
    await onExceptionChange();
    const applied = coachAppliedNotice(weeks, weekIndex);
    setNotice(applied ? { ...applied, availabilityLink: false } : null);
  }
  const togglePending = setException.isPending || clearException.isPending;
  // The coach box saves blocked time too; the board waits for it like for its own.
  const blockPending = togglePending || coachBusy;
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 5 },
    }),
  );

  // Profiles created before scheduling existed are on "UTC". Adopt the browser's
  // timezone once so dates and "today" match the athlete's calendar.
  const storedTz = query.data?.timezone;
  useEffect(() => {
    if (storedTz !== "UTC" || tzSynced.current) return;
    tzSynced.current = true;
    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (browserTz && browserTz !== "UTC")
      setTimezone.mutate({ timezone: browserTz });
  }, [storedTz, setTimezone]);

  if (query.isLoading)
    return (
      <div role="status">
        <span className="sr-only">Loading your week…</span>
        <BoardSkeleton composer={false} />
      </div>
    );
  if (query.isError || !query.data) {
    return (
      <Callout icon={Info}>
        <p>Couldn’t load your schedule.</p>
        <Button
          variant="secondary"
          size="sm"
          icon={RotateCw}
          onClick={() => void query.refetch()}
          className="mt-2.5"
        >
          Try again
        </Button>
      </Callout>
    );
  }

  const data = query.data;
  // While a draft exists everything is computed from its snapshot, not the live query.
  const input = draft?.input ?? data.input;
  const base = draft?.base ?? data.layout;
  const layout = draft?.layout ?? data.layout;
  // Stale when the week moved on under the draft, or a session the draft moves has since
  // been completed or missed (the server would refuse it for ever).
  const liveLocked = new Set(
    data.input.sessions.filter((s) => s.locked).map((s) => s.id),
  );
  const stale =
    draft !== null &&
    !apply.isPending &&
    isDraftStale(
      draft.base,
      data.layout,
      changedIds(draft.base, draft.layout),
      liveLocked,
    );
  // A draft must not snapshot availability that a block in flight is about to change.
  const editable = !data.readOnly && !apply.isPending && !blockPending;
  // Blocked time is saved straight away, so it cannot be mixed with an unsaved drag.
  const canBlock = editable && draft === null;
  const dateOf = (weekday: number) =>
    data.days.find((d) => d.weekday === weekday)!.date;
  const labelOf = (id: string) =>
    data.sessions.find((s) => s.id === id)?.label ?? "Session";
  const changed = changedIds(base, layout);
  const warnings = draft
    ? toWarnings(scoreLayout(input, layout).facts, labelOf)
    : data.warnings;
  const targets = dragging ? dropTargets(input, layout, dragging) : null;
  const unplaced = data.sessions.filter((s) => layout[s.id] === undefined);
  const rows: ("AM" | "PM" | null)[] =
    data.mode === "HALF_DAY" ? ["AM", "PM"] : [null];

  const moveOptionsFor = (sessionId: string): MoveOption[] =>
    dropTargets(input, layout, sessionId)
      .filter((t) => t.kind === "ok" || t.kind === "warn")
      .map((t) => ({
        value: cellId(t.placement),
        label:
          placementLabel(t.placement) +
          (t.kind === "warn" ? " (adds a warning)" : ""),
      }));

  function toggleBlock(weekday: number, daypart: "AM" | "PM" | null) {
    const state = blockState(data.input, weekday, daypart);
    if (state === "open")
      setException.mutate({ date: dateOf(weekday), daypart });
    else if (state === "one_off")
      clearException.mutate({ date: dateOf(weekday), daypart });
  }

  function startOrUpdateDraft(next: Layout) {
    setDraft(
      changedIds(base, next).length === 0
        ? null
        : { layout: next, base, input },
    );
  }

  function move(sessionId: string, target: Placement) {
    const next = applyDrop(input, layout, sessionId, target);
    if (next === layout) return;
    setNotice(null);
    startOrUpdateDraft(next);
  }

  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    if (e.over) move(String(e.active.id), parseCellId(String(e.over.id)));
  }

  function placeForMe() {
    const res = placeWeek({
      ...input,
      sessions: input.sessions.map((s) =>
        layout[s.id] ? { ...s, locked: true, placement: layout[s.id]! } : s,
      ),
    });
    if (res.kind === "placed") {
      setNotice(null);
      startOrUpdateDraft(res.layout);
    } else {
      setNotice({
        text: "Your availability doesn’t leave enough open times for this week.",
        availabilityLink: true,
      });
    }
  }

  function confirm(
    next: Layout,
    origin: "athlete" | "suggestion" | "replacement",
    optionId?: string,
  ) {
    apply.mutate({
      weekIndex,
      placements: Object.entries(next).map(([sessionId, p]) => ({
        sessionId,
        day: p.day,
        daypart: p.daypart,
      })),
      expected: data.sessions.map((s) => ({
        sessionId: s.id,
        placement: base[s.id] ?? null,
      })),
      carryForward: origin === "athlete" && carryForward,
      origin,
      optionId,
    });
  }

  function accept(s: MoveSuggestionView) {
    // The suggestion was made for a layout that may have moved on since.
    if (!suggestionStillValid(data.layout, s)) {
      void utils.schedule.getSuggestions.invalidate();
      return;
    }
    confirm(applySuggestion(data.layout, s), "suggestion");
  }

  function optionLayout(o: ReplacementOptionView): Layout {
    return {
      ...data.layout,
      ...Object.fromEntries(
        o.placements.map((p) => [
          p.sessionId,
          { day: p.day, daypart: p.daypart },
        ]),
      ),
    };
  }

  // The option was computed for a saved week that may have moved on since.
  function optionFits(o: ReplacementOptionView): boolean {
    const fits = optionStillValid(
      data.layout,
      o,
      data.sessions.map((s) => s.id),
    );
    if (!fits) void utils.schedule.getReplacementOptions.invalidate();
    return fits;
  }

  function acceptOption(o: ReplacementOptionView) {
    if (optionFits(o)) confirm(optionLayout(o), "replacement", o.id);
  }

  function showOption(o: ReplacementOptionView) {
    if (!optionFits(o)) return;
    setNotice(null);
    startOrUpdateDraft(optionLayout(o));
  }

  const chip = (id: string) => {
    const session = data.sessions.find((s) => s.id === id)!;
    const at = data.layout[id];
    const canFlag =
      canBlock &&
      !session.locked &&
      at !== undefined &&
      blockState(data.input, at.day, at.daypart) === "open";
    return (
      <SessionChip
        key={id}
        session={session}
        editable={editable}
        changed={changed.includes(id)}
        moveOptions={editable && !session.locked ? moveOptionsFor(id) : []}
        onMove={(target) => move(id, target)}
        onCantMake={
          canFlag && at
            ? () => toggleBlock(at.day, data.mode === "DAY" ? null : at.daypart)
            : undefined
        }
      />
    );
  };

  const today = localToday(data.timezone);
  const lastDay = data.days.length - 1;

  return (
    <section aria-label="Week schedule" className="flex flex-col gap-6">
      {coach.data?.enabled && !data.readOnly ? (
        <CoachBox
          weekIndex={weekIndex}
          blocked={blockedReason({
            draftOpen: draft !== null,
            boardSaving: togglePending || apply.isPending,
          })}
          onApplied={onCoachApplied}
          onBusyChange={setCoachBusy}
          onShowOptions={() => setDismissedOptions(null)}
        />
      ) : null}
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={(e) => setDragging(String(e.active.id))}
        onDragCancel={() => setDragging(null)}
        onDragEnd={onDragEnd}
      >
        {/* A timeline: the date on the left, the day's sessions on the right. */}
        <ol className="flex flex-col">
          {data.days.map((d, i) => {
            const state = blockState(data.input, d.weekday, null);
            const isToday = d.date === today;
            return (
              <li
                key={d.date}
                aria-current={isToday ? "date" : undefined}
                className="grid grid-cols-[84px_minmax(0,1fr)] sm:grid-cols-[112px_minmax(0,1fr)]"
              >
                <div className="flex flex-col items-start pt-[15px] pr-3 pb-3">
                  <span
                    className={
                      "text-list " + (isToday ? "text-accent" : "text-fg")
                    }
                  >
                    {DAY_NAMES[d.weekday]}
                  </span>
                  <span className="text-meta text-fg-subtle tabular-nums">
                    {isToday ? "Today" : shortDate(d.date)}
                  </span>
                  {!data.readOnly &&
                  (state === "open" || state === "one_off") ? (
                    <span className="mt-1.5 -ml-2">
                      <BlockToggle
                        state={state}
                        label={DAY_NAMES[d.weekday]!}
                        disabled={!canBlock}
                        onToggle={() => toggleBlock(d.weekday, null)}
                      />
                    </span>
                  ) : null}
                </div>
                <div className="relative pb-3 pl-6">
                  {/* The rail runs dot to dot: it starts at the first and ends at the last. */}
                  <span
                    aria-hidden
                    className={
                      "absolute left-[4.5px] border-l border-dashed border-border-strong " +
                      (i === 0 ? "top-6 " : "top-0 ") +
                      (i === lastDay ? "h-6" : "bottom-0")
                    }
                  />
                  <span
                    aria-hidden
                    className={
                      "absolute top-[19px] left-0 size-2.5 rounded-full " +
                      (isToday
                        ? "bg-accent ring-4 ring-selection"
                        : "bg-border-strong")
                    }
                  />
                  <div
                    className={
                      data.mode === "HALF_DAY"
                        ? "grid gap-2 md:grid-cols-2"
                        : "flex flex-col"
                    }
                  >
                    {rows.map((daypart) => {
                      const placement: Placement = {
                        day: d.weekday,
                        daypart,
                      };
                      const key = cellKey(placement, data.mode);
                      const saved = blockState(data.input, d.weekday, daypart);
                      const here = data.sessions.filter(
                        (s) =>
                          layout[s.id] !== undefined &&
                          cellKey(layout[s.id]!, data.mode) === key,
                      );
                      return (
                        <Cell
                          key={`${d.date}:${daypart ?? "-"}`}
                          placement={placement}
                          target={targets?.find(
                            (t) => cellId(t.placement) === cellId(placement),
                          )}
                          showHalf={daypart !== null}
                          blocked={
                            cellState(
                              input.availability,
                              data.mode,
                              placement,
                            ) === "BLOCKED"
                          }
                          note={saved === "one_off" ? "this week" : undefined}
                          toggle={
                            !data.readOnly &&
                            daypart !== null &&
                            (saved === "open" || saved === "one_off") ? (
                              <BlockToggle
                                state={saved}
                                label={`${DAY_NAMES[d.weekday]} ${daypart}`}
                                disabled={!canBlock}
                                onToggle={() => toggleBlock(d.weekday, daypart)}
                              />
                            ) : undefined
                          }
                        >
                          {here.map((s) => chip(s.id))}
                        </Cell>
                      );
                    })}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        {unplaced.length > 0 ? (
          <div className="flex flex-col gap-3 rounded-card border border-dashed border-border-strong p-3 sm:p-4">
            <div className="flex items-center justify-between gap-3 pl-1">
              <span className="text-nav text-fg-soft">Not placed yet</span>
              {editable ? (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Wand2}
                  onClick={placeForMe}
                >
                  Place for me
                </Button>
              ) : null}
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {unplaced.map((s) => chip(s.id))}
            </div>
          </div>
        ) : null}
      </DndContext>

      {notice ? (
        <Note>
          {notice.text}
          {notice.availabilityLink ? (
            <>
              {" "}
              <Link href="/app/settings" className={LINK}>
                Availability
              </Link>
            </>
          ) : null}
          {notice.weekLinks?.map((n) => (
            <span key={n}>
              {" "}
              <Link href={`/app/block/week/${n}`} className={LINK}>
                Week {n}
              </Link>
            </span>
          ))}
        </Note>
      ) : null}

      {draft ? (
        <DraftBar
          changeCount={changed.length}
          warnings={warnings}
          carryForward={carryForward}
          onCarryForward={setCarryForward}
          onDiscard={() => {
            setDraft(null);
            apply.reset();
          }}
          onConfirm={() => confirm(layout, "athlete")}
          stale={stale}
          pending={apply.isPending}
          error={apply.isError ? apply.error.message : null}
        />
      ) : (
        <>
          {!data.readOnly ? (
            <ReplacementPanel
              weekIndex={weekIndex}
              disabled={!editable}
              stranded={isStranded(data.input)}
              dismissed={dismissedOptions}
              onDismiss={setDismissedOptions}
              onAccept={acceptOption}
              onShow={showOption}
            />
          ) : null}
          {warnings.length > 0 ? (
            <ul
              aria-label="Recovery notes"
              className="flex flex-col gap-1.5 pl-1"
            >
              {warnings.map((w) => (
                <li
                  key={w}
                  className="text-card-desc flex items-start gap-2 text-fg-muted"
                >
                  <TriangleAlert
                    className="mt-[3px] size-3.5 shrink-0 text-fg-subtle"
                    aria-hidden
                  />
                  {w}
                </li>
              ))}
            </ul>
          ) : null}
          {!data.readOnly ? (
            <SuggestionCard
              weekIndex={weekIndex}
              pending={apply.isPending}
              onAccept={accept}
            />
          ) : null}
          {apply.isError ? <Note>{apply.error.message}</Note> : null}
        </>
      )}
    </section>
  );
}
