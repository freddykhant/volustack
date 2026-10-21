"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleAlert } from "lucide-react";
import type { AvailabilityCellInput } from "~/engine/schedule";
import type { ScheduleMode } from "~/schema";
import { Button, Callout, Panel, Segmented, Skeleton } from "~/components/ui-kit/app-shell-kit";
import { api } from "~/trpc/react";
import { AvailabilityGrid } from "./availability-grid";

const MODES = [
  { value: "DAY", label: "One a day" },
  { value: "HALF_DAY", label: "AM · PM" },
] as const satisfies readonly { value: ScheduleMode; label: string }[];

const MODE_HINT: Record<ScheduleMode, string> = {
  DAY: "Plan by day. The simplest view.",
  HALF_DAY: "Plan by morning and afternoon, with room for two-a-days.",
};

interface LoadedPrefs {
  scheduleMode: ScheduleMode;
  timezone: string;
  availability: AvailabilityCellInput[];
}

export function SchedulePrefsForm() {
  const prefs = api.schedule.getPrefs.useQuery();

  if (prefs.isLoading) return <PrefsSkeleton />;
  if (prefs.isError || !prefs.data) {
    return <Callout icon={CircleAlert}>Couldn’t load your schedule settings.</Callout>;
  }
  // The form body takes the stored settings as its initial state, so they never need
  // copying into state from an effect.
  return <PrefsFormBody initial={prefs.data} />;
}

/** A label/description on the left, the control on the right; stacks on narrow widths. */
function Row({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <div className="text-list text-fg">{title}</div>
        {hint ? <div className="mt-0.5 text-card-desc text-fg-muted">{hint}</div> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function PrefsFormBody({ initial }: { initial: LoadedPrefs }) {
  const router = useRouter();
  const utils = api.useUtils();
  const [mode, setMode] = useState<ScheduleMode>(initial.scheduleMode);
  const [availability, setAvailability] = useState<AvailabilityCellInput[]>(initial.availability);
  // What's on the server now — the save bar shows only while the form differs from it.
  const [stored, setStored] = useState({ mode: initial.scheduleMode, availability: initial.availability });
  const [saved, setSaved] = useState(false);
  const update = api.schedule.updatePrefs.useMutation({
    onSuccess: () => {
      setSaved(true);
      void utils.schedule.invalidate();
      router.refresh();
    },
  });

  const dirty =
    mode !== stored.mode || JSON.stringify(availability) !== JSON.stringify(stored.availability);

  function edit() {
    setSaved(false);
    update.reset();
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel padding="none">
        <div className="divide-y divide-border-subtle">
          <Row title="Board layout" hint={MODE_HINT[mode]}>
            <Segmented
              aria-label="Board layout"
              options={MODES}
              value={mode}
              onChange={(v) => {
                setMode(v);
                edit();
              }}
            />
          </Row>
          <div className="px-5 py-4">
            <div className="text-list text-fg">Availability</div>
            <div className="mt-0.5 text-card-desc text-fg-muted">
              Tap a slot to cycle Available, Preferred and Blocked. Suggestions favour preferred slots and avoid
              blocked ones.
            </div>
            <div className="mt-4">
              <AvailabilityGrid
                mode={mode}
                value={availability}
                onChange={(next) => {
                  setAvailability(next);
                  edit();
                }}
                disabled={update.isPending}
              />
            </div>
          </div>
          <Row title="Timezone" hint="Days and dates on your board follow this.">
            <span className="text-body text-fg-muted">{initial.timezone}</span>
          </Row>
        </div>
      </Panel>

      <p className="px-1 text-meta text-fg-muted">
        Changing this never moves a session on its own. If a session ends up on blocked time, your coach suggests
        a move.
      </p>

      {update.isError ? (
        <div role="alert">
          <Callout icon={CircleAlert}>{update.error.message}</Callout>
        </div>
      ) : null}

      {dirty || update.isPending ? (
        <div className="sticky bottom-6 z-10 flex justify-center">
          <div className="flex animate-rise items-center gap-3 rounded-pill border border-border bg-surface-raised py-1.5 pr-1.5 pl-4 shadow-pop">
            <span className="text-nav text-fg-soft">Unsaved changes</span>
            <Button
              variant="ghost"
              size="sm"
              disabled={update.isPending}
              onClick={() => {
                setMode(stored.mode);
                setAvailability(stored.availability);
                edit();
              }}
            >
              Discard
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={update.isPending}
              onClick={() =>
                update.mutate(
                  { scheduleMode: mode, availability },
                  { onSuccess: () => setStored({ mode, availability }) },
                )
              }
            >
              Save changes
            </Button>
          </div>
        </div>
      ) : saved ? (
        <div role="status" className="flex animate-fade items-center justify-center gap-1.5 text-meta text-fg-muted">
          <Check className="size-3.5" aria-hidden /> Saved
        </div>
      ) : null}
    </div>
  );
}

function PrefsSkeleton() {
  return (
    <Panel padding="none" aria-busy="true">
      <div className="divide-y divide-border-subtle">
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            <Skeleton className="h-4 w-28" />
            <Skeleton className="mt-2 h-3.5 w-56" />
          </div>
          <Skeleton className="h-9 w-44 rounded-pill" />
        </div>
        <div className="px-5 py-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-2 h-3.5 w-72" />
          <div className="mt-4 flex flex-col gap-3">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-4 w-10" />
                <Skeleton className="h-9 flex-1 rounded-pill" />
                <Skeleton className="h-9 flex-1 rounded-pill" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}
