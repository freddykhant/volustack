"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  applySuggestion,
  cellKey,
  placeWeek,
  scoreLayout,
  type Layout,
  type Placement,
} from "~/engine/schedule";
import { api } from "~/trpc/react";
import {
  DAY_NAMES,
  placementLabel,
  toWarnings,
  type MoveSuggestionView,
} from "~/views/schedule";
import {
  applyDrop,
  cellId,
  changedIds,
  dropTargets,
  parseCellId,
  type DropTarget,
} from "./draft";
import { DraftBar } from "./draft-bar";
import { SessionChip, type MoveOption } from "./session-chip";
import { SuggestionCard } from "./suggestion-card";

function Cell({
  placement,
  target,
  showHalf,
  children,
}: {
  placement: Placement;
  target: DropTarget | undefined;
  showHalf: boolean;
  children: React.ReactNode;
}) {
  const refused = target?.kind === "refused";
  const { setNodeRef, isOver } = useDroppable({
    id: cellId(placement),
    disabled: refused,
  });
  const tone = !target
    ? "border-border-subtle"
    : refused
      ? "border-border-subtle opacity-40"
      : target.kind === "warn"
        ? "border-dashed border-border"
        : "border-accent/40 bg-selection";
  return (
    <div
      ref={setNodeRef}
      className={`rounded-control flex min-h-20 flex-col gap-1.5 border p-1.5 transition-colors ${tone} ${isOver && !refused ? "ring-accent ring-1" : ""}`}
    >
      {showHalf ? (
        <span className="text-fg-subtle text-[11px]">{placement.daypart}</span>
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
  const [draft, setDraft] = useState<Layout | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [carryForward, setCarryForward] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const tzSynced = useRef(false);

  const refresh = () => {
    void utils.schedule.invalidate();
    router.refresh();
  };
  const setTimezone = api.schedule.setTimezone.useMutation({
    onSuccess: refresh,
  });
  const apply = api.schedule.applyLayout.useMutation({
    onSuccess: (res) => {
      setDraft(null);
      setCarryForward(false);
      setNotice(
        res.skipped.length > 0
          ? `Saved. Week ${res.skipped.map((s) => s.weekIndex).join(", ")} kept its own layout.`
          : null,
      );
      refresh();
    },
    onError: (err) => {
      if (err.data?.code === "CONFLICT") refresh();
    },
  });
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
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
    return <p className="text-nav text-fg-subtle">Loading your week…</p>;
  if (query.isError || !query.data) {
    return (
      <div className="rounded-control border-border bg-callout text-nav text-fg-soft border px-3 py-2">
        <p>Couldn’t load your schedule.</p>
        <button
          type="button"
          onClick={() => void query.refetch()}
          className="text-accent hover:text-accent-strong mt-1 font-medium"
        >
          Try again
        </button>
      </div>
    );
  }

  const data = query.data;
  const saved = data.layout;
  const layout = draft ?? saved;
  const editable = !data.readOnly && !apply.isPending;
  const labelOf = (id: string) =>
    data.sessions.find((s) => s.id === id)?.label ?? "Session";
  const changed = changedIds(saved, layout);
  const warnings = draft
    ? toWarnings(scoreLayout(data.input, layout).facts, labelOf)
    : data.warnings;
  const targets = dragging ? dropTargets(data.input, layout, dragging) : null;
  const unplaced = data.sessions.filter((s) => layout[s.id] === undefined);
  const rows: ("AM" | "PM" | null)[] =
    data.mode === "HALF_DAY" ? ["AM", "PM"] : [null];

  const moveOptionsFor = (sessionId: string): MoveOption[] =>
    dropTargets(data.input, layout, sessionId)
      .filter((t) => t.kind === "ok" || t.kind === "warn")
      .map((t) => ({
        value: cellId(t.placement),
        label:
          placementLabel(t.placement) +
          (t.kind === "warn" ? " (less rest)" : ""),
      }));

  function move(sessionId: string, target: Placement) {
    const next = applyDrop(data.input, layout, sessionId, target);
    if (next === layout) return;
    setNotice(null);
    setDraft(changedIds(saved, next).length === 0 ? null : next);
  }

  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    if (e.over) move(String(e.active.id), parseCellId(String(e.over.id)));
  }

  function placeForMe() {
    const res = placeWeek({
      ...data.input,
      sessions: data.input.sessions.map((s) =>
        layout[s.id] ? { ...s, locked: true, placement: layout[s.id]! } : s,
      ),
    });
    if (res.kind === "placed") setDraft(res.layout);
    else
      setNotice(
        "Your availability doesn’t leave enough open times for this week.",
      );
  }

  function confirm(next: Layout, origin: "athlete" | "suggestion") {
    apply.mutate({
      weekIndex,
      placements: Object.entries(next).map(([sessionId, p]) => ({
        sessionId,
        day: p.day,
        daypart: p.daypart,
      })),
      expected: data.sessions.map((s) => ({
        sessionId: s.id,
        placement: saved[s.id] ?? null,
      })),
      carryForward: origin === "athlete" && carryForward,
      origin,
    });
  }

  const chip = (id: string) => {
    const session = data.sessions.find((s) => s.id === id)!;
    return (
      <SessionChip
        key={id}
        session={session}
        editable={editable}
        changed={changed.includes(id)}
        moveOptions={editable && !session.locked ? moveOptionsFor(id) : []}
        onMove={(target) => move(id, target)}
      />
    );
  };

  return (
    <section aria-label="Week schedule" className="flex flex-col gap-4">
      <DndContext
        sensors={sensors}
        onDragStart={(e) => setDragging(String(e.active.id))}
        onDragCancel={() => setDragging(null)}
        onDragEnd={onDragEnd}
      >
        <div className="overflow-x-auto">
          <div className="grid min-w-[680px] grid-cols-7 gap-2">
            {data.days.map((d) => (
              <div key={d.date} className="text-fg-subtle px-1 text-[12px]">
                <span className="text-fg-soft font-medium">
                  {DAY_NAMES[d.weekday]}
                </span>{" "}
                {Number(d.date.slice(8))}
              </div>
            ))}
            {rows.map((daypart) =>
              data.days.map((d) => {
                const placement: Placement = { day: d.weekday, daypart };
                const key = cellKey(placement, data.mode);
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
                  >
                    {here.map((s) => chip(s.id))}
                  </Cell>
                );
              }),
            )}
          </div>
        </div>

        {unplaced.length > 0 ? (
          <div className="rounded-card border-border-subtle flex flex-col gap-2 border p-3">
            <div className="flex items-center justify-between">
              <span className="text-nav text-fg-muted">Not placed yet</span>
              {editable ? (
                <button
                  type="button"
                  onClick={placeForMe}
                  className="text-nav text-accent hover:text-accent-strong font-medium"
                >
                  Place for me
                </button>
              ) : null}
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {unplaced.map((s) => chip(s.id))}
            </div>
          </div>
        ) : null}
      </DndContext>

      {notice ? (
        <p className="rounded-control border-border bg-callout text-nav text-fg-soft border px-3 py-2">
          {notice}{" "}
          <Link
            href="/app/settings"
            className="text-accent hover:text-accent-strong font-medium"
          >
            Availability
          </Link>
        </p>
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
          pending={apply.isPending}
          error={apply.isError ? apply.error.message : null}
        />
      ) : (
        <>
          {warnings.length > 0 ? (
            <ul className="text-nav text-fg-muted flex flex-col gap-1">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
          {!data.readOnly ? (
            <SuggestionCard
              weekIndex={weekIndex}
              pending={apply.isPending}
              onAccept={(s: MoveSuggestionView) =>
                confirm(applySuggestion(saved, s), "suggestion")
              }
            />
          ) : null}
          {apply.isError ? (
            <p className="rounded-control border-border bg-callout text-nav text-fg-soft border px-3 py-2">
              {apply.error.message}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
