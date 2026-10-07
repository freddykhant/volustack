"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AvailabilityCellInput } from "~/engine/schedule";
import type { ScheduleMode } from "~/schema";
import { api } from "~/trpc/react";
import { AvailabilityGrid } from "./availability-grid";

const MODES: { value: ScheduleMode; label: string; hint: string }[] = [
  {
    value: "DAY",
    label: "One session a day",
    hint: "Plan by day. The simplest view.",
  },
  {
    value: "HALF_DAY",
    label: "AM / PM",
    hint: "Plan by morning and afternoon, with room for two-a-days.",
  },
];

interface LoadedPrefs {
  scheduleMode: ScheduleMode;
  timezone: string;
  availability: AvailabilityCellInput[];
}

export function SchedulePrefsForm() {
  const prefs = api.schedule.getPrefs.useQuery();

  if (prefs.isLoading)
    return <p className="text-nav text-fg-subtle">Loading…</p>;
  if (prefs.isError || !prefs.data) {
    return (
      <p className="text-nav text-fg-soft">
        Couldn’t load your schedule settings.
      </p>
    );
  }
  // The form body takes the stored settings as its initial state, so they never need
  // copying into state from an effect.
  return <PrefsFormBody initial={prefs.data} />;
}

function PrefsFormBody({ initial }: { initial: LoadedPrefs }) {
  const router = useRouter();
  const utils = api.useUtils();
  const [mode, setMode] = useState<ScheduleMode>(initial.scheduleMode);
  const [availability, setAvailability] = useState<AvailabilityCellInput[]>(
    initial.availability,
  );
  const [saved, setSaved] = useState(false);
  const update = api.schedule.updatePrefs.useMutation({
    onSuccess: () => {
      setSaved(true);
      void utils.schedule.invalidate();
      router.refresh();
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className="text-nav text-fg font-medium">
          How you plan your week
        </span>
        <div className="flex flex-col gap-2 sm:flex-row">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              aria-pressed={mode === m.value}
              disabled={update.isPending}
              onClick={() => {
                setMode(m.value);
                setSaved(false);
                update.reset();
              }}
              className={
                "rounded-control flex-1 border p-3 text-left transition-colors disabled:opacity-60 " +
                (mode === m.value
                  ? "border-accent bg-selection"
                  : "border-border-subtle hover:border-border")
              }
            >
              <div
                className={
                  "text-nav font-medium " +
                  (mode === m.value ? "text-accent" : "text-fg")
                }
              >
                {m.label}
              </div>
              <div className="text-fg-muted text-[12px]">{m.hint}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-nav text-fg font-medium">When you can train</span>
        <AvailabilityGrid
          mode={mode}
          value={availability}
          onChange={(next) => {
            setAvailability(next);
            setSaved(false);
            update.reset();
          }}
          disabled={update.isPending}
        />
        <p className="text-fg-subtle text-[12px]">
          Changing this never moves a session on its own. If a session ends up
          on a blocked time, your coach will suggest a move.
        </p>
      </div>

      {update.isError ? (
        <p
          role="alert"
          className="rounded-control border-border bg-callout text-nav text-fg-soft border px-3 py-2"
        >
          {update.error.message}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => update.mutate({ scheduleMode: mode, availability })}
          disabled={update.isPending}
          className="rounded-control bg-accent text-nav hover:bg-accent-strong px-4 py-2 font-medium text-white transition-colors disabled:opacity-60"
        >
          {update.isPending ? "Saving…" : "Save"}
        </button>
        {saved ? (
          <span role="status" className="text-nav text-fg-muted">
            Saved.
          </span>
        ) : null}
        <span className="text-fg-subtle text-[12px]">
          Timezone: {initial.timezone}
        </span>
      </div>
    </div>
  );
}
