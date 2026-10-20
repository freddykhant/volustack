"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AvailabilityCellInput } from "~/engine/schedule";
import type { ScheduleMode } from "~/schema";
import { Button } from "~/components/ui-kit/app-shell-kit";
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
    return <p className="text-card-desc text-fg-muted">Loading…</p>;
  if (prefs.isError || !prefs.data) {
    return (
      <p className="text-card-desc text-fg-soft">
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
        <span className="text-nav text-fg-soft">
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
                "flex-1 rounded-callout border p-4 text-left transition-colors disabled:opacity-60 " +
                (mode === m.value
                  ? "border-accent/25 bg-selection"
                  : "border-transparent bg-sunken hover:bg-press")
              }
            >
              <div
                className={
                  "text-list " +
                  (mode === m.value ? "text-accent" : "text-fg")
                }
              >
                {m.label}
              </div>
              <div className="mt-0.5 text-meta text-fg-muted">{m.hint}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-nav text-fg-soft">When you can train</span>
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
        <p className="text-meta text-fg-muted">
          Changing this never moves a session on its own. If a session ends up
          on a blocked time, your coach will suggest a move.
        </p>
      </div>

      {update.isError ? (
        <p
          role="alert"
          className="rounded-control bg-callout px-3 py-2 text-card-desc text-fg-soft"
        >
          {update.error.message}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          onClick={() => update.mutate({ scheduleMode: mode, availability })}
          loading={update.isPending}
        >
          {update.isPending ? "Saving…" : "Save"}
        </Button>
        {saved ? (
          <span role="status" className="text-card-desc text-fg-muted">
            Saved.
          </span>
        ) : null}
        <span className="text-meta text-fg-muted">
          Timezone: {initial.timezone}
        </span>
      </div>
    </div>
  );
}
