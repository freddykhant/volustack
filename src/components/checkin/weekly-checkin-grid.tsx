"use client";

import type { MuscleGroup } from "~/schema";

export interface MuscleScore {
  muscle: MuscleGroup;
  recovery: number;
  joint: number;
}

const RECOVERY_LABELS = ["Wrecked", "Sore", "Okay", "Fresh"];
const JOINT_LABELS = ["Fine", "Niggle", "Achy", "Painful"];

function humanMuscle(m: string): string {
  return m.charAt(0) + m.slice(1).toLowerCase().replace(/_/g, " ");
}

/** A 0-3 selector. dot fill communicates intensity; accent marks the choice. */
function Scale({
  value,
  onChange,
  labels,
  ariaLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  labels: string[];
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex gap-1.5">
      {labels.map((label, i) => (
        <button
          key={i}
          type="button"
          aria-pressed={value === i}
          title={label}
          onClick={() => onChange(i)}
          className={
            "size-8 rounded-control border text-eyebrow transition-colors " +
            (value === i ? "border-accent bg-selection text-accent" : "border-border-subtle text-fg-subtle hover:border-border")
          }
        >
          {i}
        </button>
      ))}
    </div>
  );
}

export function WeeklyCheckInGrid({
  muscles,
  onChange,
  onSubmit,
  isPending,
}: {
  muscles: MuscleScore[];
  onChange: (next: MuscleScore[]) => void;
  onSubmit: () => void;
  isPending: boolean;
}) {
  function set(muscle: MuscleGroup, key: "recovery" | "joint", v: number) {
    onChange(muscles.map((m) => (m.muscle === muscle ? { ...m, [key]: v } : m)));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {muscles.map((m) => (
          <div key={m.muscle} className="rounded-control border border-border-subtle bg-surface p-4">
            <div className="text-card-title text-fg">{humanMuscle(m.muscle)}</div>
            <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-eyebrow font-medium text-fg-soft">Recovery</span>
                <Scale value={m.recovery} onChange={(v) => set(m.muscle, "recovery", v)} labels={RECOVERY_LABELS} ariaLabel={`${humanMuscle(m.muscle)} recovery`} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-eyebrow font-medium text-fg-soft">Joints</span>
                <Scale value={m.joint} onChange={(v) => set(m.muscle, "joint", v)} labels={JOINT_LABELS} ariaLabel={`${humanMuscle(m.muscle)} joint stress`} />
              </label>
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        disabled={isPending}
        onClick={onSubmit}
        className="inline-flex items-center justify-center gap-2 rounded-control bg-accent px-5 py-3 text-list font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
      >
        {isPending ? "Reading your week…" : "See next week's plan"}
      </button>
    </div>
  );
}
