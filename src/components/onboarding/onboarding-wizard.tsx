"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, CircleAlert } from "lucide-react";
import {
  MUSCLE_GROUPS,
  type ExperienceLevel,
  type MuscleGroup,
  type ScheduleMode,
  type Sex,
  type SplitType,
} from "~/schema";
import { api } from "~/trpc/react";
import type { AvailabilityCellInput } from "~/engine/schedule";
import { AvailabilityGrid } from "~/components/schedule/availability-grid";
import { openDayCount } from "~/components/schedule/availability";
import { Button, Callout } from "~/components/ui-kit/app-shell-kit";

const SPLIT_OPTIONS: { value: SplitType; label: string; hint: string }[] = [
  { value: "FULL_BODY", label: "Full Body", hint: "Every muscle each session — great at lower frequency" },
  { value: "UPPER_LOWER", label: "Upper / Lower", hint: "Alternating upper- and lower-body days" },
  { value: "PUSH_PULL_LEGS", label: "Push / Pull / Legs", hint: "Push, pull, and leg days — higher frequency" },
];

const PROFICIENCY_OPTIONS: { value: ExperienceLevel; label: string; hint: string }[] = [
  { value: "BEGINNER", label: "Beginner", hint: "New to structured training — 4-week block" },
  { value: "INTERMEDIATE", label: "Intermediate", hint: "A year or two of consistent training — 6-week block" },
  { value: "ADVANCED", label: "Advanced", hint: "Years of hard training — 8-week block" },
];

function muscleLabel(m: string): string {
  return m.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

const STEPS: { title: string; subtitle: string }[] = [
  { title: "About you", subtitle: "A few basics so we can tailor volume and recovery." },
  { title: "Your schedule", subtitle: "How much you can train — we'll fit the plan to it." },
  { title: "Your split", subtitle: "How you like to structure your training week." },
  { title: "Experience & priorities", subtitle: "This sets your starting template. You can fine-tune later." },
  { title: "Your week", subtitle: "When you can train. You can change this any time in Settings." },
];

export function OnboardingWizard() {
  const router = useRouter();
  const createPlan = api.onboarding.createPlan.useMutation({
    onSuccess: () => {
      router.refresh();
      router.push("/app/block");
    },
  });

  const [step, setStep] = useState(0);

  // Bio + logistics kept as strings so number inputs can be cleared; parsed on submit.
  const [sex, setSex] = useState<Sex | null>(null);
  const [age, setAge] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [daysPerWeek, setDaysPerWeek] = useState(4);
  const [sessionLengthCapMin, setSessionLengthCapMin] = useState("75");
  const [splitType, setSplitType] = useState<SplitType>("UPPER_LOWER");
  const [proficiency, setProficiency] = useState<ExperienceLevel>("INTERMEDIATE");
  const [priorityMuscles, setPriorityMuscles] = useState<MuscleGroup[]>([]);
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("DAY");
  const [availability, setAvailability] = useState<AvailabilityCellInput[]>([]);

  const num = (s: string) => (s.trim() === "" ? NaN : Number(s));

  const stepValid = (s: number): boolean => {
    if (s === 0) {
      const a = num(age), h = num(heightCm), w = num(weightKg);
      return (
        sex !== null &&
        Number.isInteger(a) && a >= 13 && a <= 100 &&
        h >= 120 && h <= 250 &&
        w >= 30 && w <= 300
      );
    }
    if (s === 1) {
      const cap = num(sessionLengthCapMin);
      return daysPerWeek >= 1 && daysPerWeek <= 7 && Number.isInteger(cap) && cap >= 15 && cap <= 240;
    }
    return true; // steps 2–4 always have a valid default selection
  };

  const canContinue = stepValid(step);
  const isLast = step === STEPS.length - 1;

  function togglePriority(m: MuscleGroup) {
    setPriorityMuscles((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : prev.length >= 3 ? prev : [...prev, m],
    );
  }

  function submit() {
    if (sex === null) return;
    createPlan.mutate({
      sex,
      age: num(age),
      heightCm: num(heightCm),
      weightKg: num(weightKg),
      daysPerWeek,
      sessionLengthCapMin: num(sessionLengthCapMin),
      splitType,
      proficiency,
      priorityMuscles,
      scheduleMode,
      availability,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    });
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Progress */}
      <div className="flex items-center gap-3">
        <ol className="flex flex-1 gap-1.5" aria-label="Progress">
          {STEPS.map((s, i) => (
            <li
              key={s.title}
              aria-current={i === step ? "step" : undefined}
              className={
                "h-1 flex-1 rounded-pill transition-colors duration-300 ease-soft " +
                (i <= step ? "bg-accent" : "bg-press")
              }
            >
              <span className="sr-only">
                {s.title}
                {i < step ? " (done)" : i === step ? " (current)" : ""}
              </span>
            </li>
          ))}
        </ol>
        <span className="text-meta tabular-nums text-fg-subtle" aria-hidden>
          {step + 1} / {STEPS.length}
        </span>
      </div>

      {/* Step heading + fields — keyed so each step rises in */}
      <div key={step} className="animate-rise flex flex-col gap-7">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-page-title text-fg">{STEPS[step]!.title}</h1>
          <p className="text-body text-fg-muted">{STEPS[step]!.subtitle}</p>
        </div>

        <div className="flex flex-col gap-6">
          {step === 0 && (
            <>
              <FieldGroup legend="Sex">
                <div className="grid grid-cols-2 gap-2">
                  {(["MALE", "FEMALE"] as const).map((s) => (
                    <Choice key={s} selected={sex === s} onClick={() => setSex(s)}>
                      {s === "MALE" ? "Male" : "Female"}
                    </Choice>
                  ))}
                </div>
              </FieldGroup>
              <NumberField label="Age" value={age} onChange={setAge} placeholder="28" />
              <div className="grid grid-cols-2 gap-4">
                <NumberField label="Height" value={heightCm} onChange={setHeightCm} placeholder="180" unit="cm" />
                <NumberField label="Weight" value={weightKg} onChange={setWeightKg} placeholder="82" unit="kg" />
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <FieldGroup legend="Training days per week">
                <div className="grid grid-cols-7 gap-1.5">
                  {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                    <Choice key={d} selected={daysPerWeek === d} onClick={() => setDaysPerWeek(d)}>
                      <span className="tabular-nums">{d}</span>
                    </Choice>
                  ))}
                </div>
              </FieldGroup>
              <NumberField
                label="Session length cap"
                value={sessionLengthCapMin}
                onChange={setSessionLengthCapMin}
                placeholder="75"
                unit="min"
              />
            </>
          )}

          {step === 2 && (
            <FieldGroup legend="Split" hideLegend>
              <div className="flex flex-col gap-2">
                {SPLIT_OPTIONS.map((o) => (
                  <CardChoice
                    key={o.value}
                    selected={splitType === o.value}
                    onClick={() => setSplitType(o.value)}
                    title={o.label}
                    hint={o.hint}
                  />
                ))}
              </div>
            </FieldGroup>
          )}

          {step === 3 && (
            <>
              <FieldGroup legend="Experience">
                <div className="flex flex-col gap-2">
                  {PROFICIENCY_OPTIONS.map((o) => (
                    <CardChoice
                      key={o.value}
                      selected={proficiency === o.value}
                      onClick={() => {
                        setProficiency(o.value);
                        if (o.value === "BEGINNER") setPriorityMuscles([]);
                      }}
                      title={o.label}
                      hint={o.hint}
                    />
                  ))}
                </div>
              </FieldGroup>
              {proficiency === "BEGINNER" ? (
                <Note>
                  Beginners train every muscle evenly — priority muscles unlock once you progress past the beginner
                  template.
                </Note>
              ) : (
                <FieldGroup
                  legend={
                    <>
                      Priority muscles{" "}
                      <span className="font-normal text-fg-subtle">
                        — optional (<span className="tabular-nums">{priorityMuscles.length}/3</span>)
                      </span>
                    </>
                  }
                >
                  <div className="flex flex-wrap gap-2">
                    {MUSCLE_GROUPS.map((m) => {
                      const on = priorityMuscles.includes(m);
                      const disabled = !on && priorityMuscles.length >= 3;
                      return (
                        <button
                          key={m}
                          type="button"
                          disabled={disabled}
                          aria-pressed={on}
                          onClick={() => togglePriority(m)}
                          className={
                            "inline-flex h-8 items-center gap-1.5 rounded-pill border px-3.5 text-nav transition-[background-color,border-color,color,opacity] duration-200 active:scale-[0.98] " +
                            (on
                              ? "border-accent bg-selection text-accent"
                              : disabled
                                ? "cursor-not-allowed border-border-subtle bg-surface text-fg-subtle opacity-50"
                                : "border-border bg-surface text-fg-soft shadow-control hover:border-border-strong hover:text-fg")
                          }
                        >
                          {on ? <Check className="-ml-0.5 size-3.5" strokeWidth={2.5} aria-hidden /> : null}
                          {muscleLabel(m)}
                        </button>
                      );
                    })}
                  </div>
                </FieldGroup>
              )}
            </>
          )}

          {step === 4 && (
            <>
              <FieldGroup legend="How you plan your week">
                <div className="flex flex-col gap-2">
                  <CardChoice
                    selected={scheduleMode === "DAY"}
                    onClick={() => setScheduleMode("DAY")}
                    title="One session a day"
                    hint="Plan by day. The simplest view."
                  />
                  <CardChoice
                    selected={scheduleMode === "HALF_DAY"}
                    onClick={() => setScheduleMode("HALF_DAY")}
                    title="AM / PM"
                    hint="Plan by morning and afternoon, with room for two-a-days."
                  />
                </div>
              </FieldGroup>
              <FieldGroup
                legend={
                  <>
                    When you can train <span className="font-normal text-fg-subtle">— optional</span>
                  </>
                }
              >
                <AvailabilityGrid mode={scheduleMode} value={availability} onChange={setAvailability} />
              </FieldGroup>
              {openDayCount(availability) < daysPerWeek ? (
                <Note>
                  You train {daysPerWeek} days a week but have left {openDayCount(availability)} open
                  {scheduleMode === "HALF_DAY" ? ", so some days will have two sessions or stay unplaced" : ", so some sessions will start unplaced"}.
                  You can place them yourself afterwards.
                </Note>
              ) : null}
            </>
          )}
        </div>
      </div>

      {createPlan.isError && <Callout icon={CircleAlert}>{createPlan.error.message}</Callout>}

      {/* Footer nav */}
      <div className="flex items-center justify-between border-t border-border-subtle pt-6">
        <Button
          variant="ghost"
          size="lg"
          icon={ArrowLeft}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0 || createPlan.isPending}
          aria-hidden={step === 0 ? true : undefined}
          className={"-ml-3 " + (step === 0 ? "invisible" : "")}
        >
          Back
        </Button>
        {isLast ? (
          <Button variant="primary" size="lg" onClick={submit} loading={createPlan.isPending}>
            Create my plan
          </Button>
        ) : (
          <Button
            variant="primary"
            size="lg"
            trailingIcon={ArrowRight}
            onClick={() => setStep((s) => s + 1)}
            disabled={!canContinue}
          >
            Continue
          </Button>
        )}
      </div>
    </div>
  );
}

const INPUT =
  "h-11 w-full rounded-control border border-transparent bg-sunken px-3 text-body tabular-nums text-fg outline-none " +
  "transition-[background-color,border-color,box-shadow] duration-200 placeholder:text-fg-subtle " +
  "hover:bg-press focus:border-border-strong focus:bg-surface-raised focus:shadow-control " +
  // hide the number spinners
  "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

const LABEL = "text-nav font-medium text-fg-soft";

/** A labelled group of buttons. fieldset + legend, not <label>: a label would forward clicks on its text to the first button. */
function FieldGroup({
  legend,
  hideLegend,
  children,
}: {
  legend: React.ReactNode;
  /** When the step heading already says it: keep the group name for screen readers only. */
  hideLegend?: boolean;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="min-w-0 border-0 p-0">
      <legend className={hideLegend ? "sr-only" : "mb-2.5 p-0 " + LABEL}>{legend}</legend>
      {children}
    </fieldset>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="rounded-control bg-sunken px-3.5 py-3 text-card-desc text-fg-muted">{children}</p>;
}

function NumberField({
  label,
  value,
  onChange,
  placeholder,
  unit,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  unit?: string;
}) {
  return (
    <label className="flex flex-col gap-2.5">
      <span className={LABEL}>{label}</span>
      <div className="relative">
        <input
          type="number"
          inputMode="numeric"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={INPUT + (unit ? " pr-12" : "")}
        />
        {unit ? (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-nav text-fg-subtle">
            {unit}
          </span>
        ) : null}
      </div>
    </label>
  );
}

function Choice({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={
        "h-11 rounded-control border text-list transition-[background-color,border-color,color,box-shadow] duration-200 active:scale-[0.98] " +
        (selected
          ? "border-accent bg-selection text-accent ring-1 ring-accent"
          : "border-border bg-surface text-fg-soft shadow-control hover:border-border-strong hover:text-fg")
      }
    >
      {children}
    </button>
  );
}

function CardChoice({
  selected,
  onClick,
  title,
  hint,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={
        "flex items-start gap-3.5 rounded-callout border p-4 text-left transition-[background-color,border-color,box-shadow] duration-200 " +
        (selected
          ? "border-accent bg-selection ring-1 ring-accent"
          : "border-border bg-surface shadow-control hover:border-border-strong")
      }
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-list text-fg">{title}</span>
        <span className="text-card-desc text-fg-muted">{hint}</span>
      </span>
      <span
        aria-hidden
        className={
          "mt-px flex size-5 shrink-0 items-center justify-center rounded-pill border transition-colors duration-200 " +
          (selected ? "border-accent bg-accent text-on-accent" : "border-border-strong bg-surface-raised")
        }
      >
        {selected ? <Check className="size-3" strokeWidth={3} /> : null}
      </span>
    </button>
  );
}
