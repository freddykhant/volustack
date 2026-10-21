"use client";

import { useId, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { confirmErrorText } from "~/components/coach/messages";
import { Button } from "~/components/ui-kit/app-shell-kit";
import {
  ActivityIntensityEnum,
  ActivityKindEnum,
  DaypartEnum,
  MAX_ACTIVITIES_PER_DAY,
  type ActivityIntensity,
  type ActivityKind,
  type Daypart,
} from "~/schema";
import { api } from "~/trpc/react";
import {
  ACTIVITY_INTENSITY_LABEL,
  ACTIVITY_KIND_LABEL,
  activityChipText,
  type ActivityView,
} from "~/views/activity";
import { EMPTY_ACTIVITY_DRAFT, toAddInput, type ActivityDraft } from "./activity-form";

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const FIELD =
  "text-meta h-8 w-full min-w-0 appearance-none rounded-control border border-transparent bg-sunken px-3 text-fg transition-[background-color,border-color] duration-200 focus:border-border-strong focus:bg-surface-raised disabled:opacity-45";

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-meta font-medium text-fg-subtle">
        {label}
      </label>
      {children}
    </div>
  );
}

function SelectBox({ children, ...rest }: React.ComponentProps<"select">) {
  return (
    <div className="relative min-w-0">
      <select {...rest} className={FIELD + " cursor-pointer pr-7"}>
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-fg-subtle"
        aria-hidden
      />
    </div>
  );
}

/** One day's outside activities: chips, and an inline form to add another. Activities
 * only ever shape coach cues, so this never touches the schedule. */
export function ActivityStrip({
  weekIndex,
  date,
  activities,
  readOnly,
  disabled,
}: {
  weekIndex: number;
  date: string;
  /** Already filtered to this date. */
  activities: ActivityView[];
  readOnly: boolean;
  /** The board is saving. */
  disabled: boolean;
}) {
  const utils = api.useUtils();
  const ids = useId();
  const addButton = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ActivityDraft>(EMPTY_ACTIVITY_DRAFT);
  const [problem, setProblem] = useState<string | null>(null);

  const refresh = () => {
    void utils.activity.list.invalidate({ weekIndex });
    void utils.cue.upcoming.invalidate();
  };
  const add = api.activity.add.useMutation({
    onSuccess: () => {
      refresh();
      close();
    },
  });
  const remove = api.activity.remove.useMutation({ onSuccess: refresh });
  const busy = disabled || add.isPending || remove.isPending;

  function close() {
    setOpen(false);
    setDraft(EMPTY_ACTIVITY_DRAFT);
    setProblem(null);
    add.reset();
  }

  function cancel() {
    close();
    addButton.current?.focus();
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const input = toAddInput(draft, weekIndex, date);
    if (typeof input === "string") {
      setProblem(input);
      return;
    }
    setProblem(null);
    add.mutate(input);
  }

  const canAdd = !readOnly && activities.length < MAX_ACTIVITIES_PER_DAY;
  if (activities.length === 0 && !canAdd) return null;
  const alert = problem ?? confirmErrorText(add.error);
  const patch = (p: Partial<ActivityDraft>) => setDraft((d) => ({ ...d, ...p }));

  return (
    <div className="mt-1 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {activities.map((a) => (
          <span
            key={a.id}
            className={
              "inline-flex h-6 items-center gap-1 rounded-pill bg-sunken text-[12px] leading-none font-medium whitespace-nowrap text-fg-muted " +
              (readOnly ? "px-2.5" : "pr-1 pl-2.5")
            }
          >
            {activityChipText(a)}
            {readOnly ? null : (
              <button
                type="button"
                aria-label={`Remove ${activityChipText(a)}`}
                disabled={busy}
                onClick={() => remove.mutate({ weekIndex, id: a.id })}
                className="flex size-4 items-center justify-center rounded-pill text-fg-subtle transition-colors hover:bg-press hover:text-fg disabled:pointer-events-none disabled:opacity-45"
              >
                <X className="size-3" aria-hidden />
              </button>
            )}
          </span>
        ))}
        {canAdd ? (
          <button
            ref={addButton}
            type="button"
            aria-expanded={open}
            disabled={busy}
            onClick={() => (open ? cancel() : setOpen(true))}
            className="text-meta h-6 rounded-pill px-2 font-medium text-fg-subtle transition-colors hover:bg-hover hover:text-fg disabled:pointer-events-none disabled:opacity-45"
          >
            + activity
          </button>
        ) : null}
      </div>
      {canAdd && open ? (
        <form
          aria-label="Add an outside activity"
          onSubmit={submit}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              cancel();
            }
          }}
          className="flex flex-col gap-3 rounded-callout bg-sunken p-3"
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Field id={`${ids}-kind`} label="Kind">
              <SelectBox
                id={`${ids}-kind`}
                value={draft.kind}
                disabled={busy}
                onChange={(e) => patch({ kind: e.target.value as ActivityKind })}
              >
                {ActivityKindEnum.options.map((k) => (
                  <option key={k} value={k}>
                    {ACTIVITY_KIND_LABEL[k]}
                  </option>
                ))}
              </SelectBox>
            </Field>
            <Field id={`${ids}-intensity`} label="Intensity">
              <SelectBox
                id={`${ids}-intensity`}
                value={draft.intensity}
                disabled={busy}
                onChange={(e) =>
                  patch({ intensity: e.target.value as ActivityIntensity })
                }
              >
                {ActivityIntensityEnum.options.map((i) => (
                  <option key={i} value={i}>
                    {capitalise(ACTIVITY_INTENSITY_LABEL[i])}
                  </option>
                ))}
              </SelectBox>
            </Field>
            <Field id={`${ids}-time`} label="Time">
              <SelectBox
                id={`${ids}-time`}
                value={draft.daypart ?? ""}
                disabled={busy}
                onChange={(e) =>
                  patch({
                    daypart: e.target.value === "" ? null : (e.target.value as Daypart),
                  })
                }
              >
                <option value="">Not said</option>
                {DaypartEnum.options.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </SelectBox>
            </Field>
            <Field id={`${ids}-minutes`} label="Minutes (optional)">
              <input
                id={`${ids}-minutes`}
                inputMode="numeric"
                autoComplete="off"
                value={draft.minutes}
                disabled={busy}
                onChange={(e) => patch({ minutes: e.target.value })}
                className={FIELD + " tabular-nums"}
              />
            </Field>
          </div>
          {alert ? (
            <p role="alert" className="text-card-desc text-fg-soft">
              {alert}
            </p>
          ) : null}
          <div className="flex items-center gap-2">
            <Button type="submit" variant="secondary" size="sm" disabled={busy}>
              Add
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={cancel}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
