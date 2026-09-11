"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MUSCLE_GROUPS, type ExperienceLevel, type MuscleGroup, type Sex, type SplitType } from "~/schema";
import { api } from "~/trpc/react";

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

const STEP_TITLES = ["About you", "Your schedule", "Your split", "Experience & priorities"];

export function OnboardingWizard() {
  const router = useRouter();
  const createPlan = api.onboarding.createPlan.useMutation({
    onSuccess: () => router.push("/app/block"),
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
    return true; // steps 2 & 3 always have a valid default selection
  };

  const canContinue = stepValid(step);
  const isLast = step === STEP_TITLES.length - 1;

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
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          {STEP_TITLES.map((_, i) => (
            <span
              key={i}
              className={"h-1.5 w-8 rounded-pill " + (i <= step ? "bg-accent" : "bg-border-subtle")}
            />
          ))}
        </div>
        <h1 className="text-list font-semibold text-fg">{STEP_TITLES[step]}</h1>
        <p className="text-nav text-fg-muted">Let&apos;s build your first training block.</p>
      </header>

      <div className="flex flex-col gap-5">
        {step === 0 && (
          <>
            <Field label="Sex">
              <div className="flex gap-2">
                {(["MALE", "FEMALE"] as const).map((s) => (
                  <Choice key={s} selected={sex === s} onClick={() => setSex(s)}>
                    {s === "MALE" ? "Male" : "Female"}
                  </Choice>
                ))}
              </div>
            </Field>
            <NumberField label="Age" value={age} onChange={setAge} placeholder="28" />
            <NumberField label="Height (cm)" value={heightCm} onChange={setHeightCm} placeholder="180" />
            <NumberField label="Weight (kg)" value={weightKg} onChange={setWeightKg} placeholder="82" />
          </>
        )}

        {step === 1 && (
          <>
            <Field label="Training days per week">
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <Choice key={d} selected={daysPerWeek === d} onClick={() => setDaysPerWeek(d)}>
                    {d}
                  </Choice>
                ))}
              </div>
            </Field>
            <NumberField
              label="Session length cap (min)"
              value={sessionLengthCapMin}
              onChange={setSessionLengthCapMin}
              placeholder="75"
            />
          </>
        )}

        {step === 2 && (
          <Field label="Split">
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
          </Field>
        )}

        {step === 3 && (
          <>
            <Field label="Experience">
              <div className="flex flex-col gap-2">
                {PROFICIENCY_OPTIONS.map((o) => (
                  <CardChoice
                    key={o.value}
                    selected={proficiency === o.value}
                    onClick={() => setProficiency(o.value)}
                    title={o.label}
                    hint={o.hint}
                  />
                ))}
              </div>
            </Field>
            <Field label={`Priority muscles (optional, up to 3 — ${priorityMuscles.length}/3)`}>
              <div className="flex flex-wrap gap-2">
                {MUSCLE_GROUPS.map((m) => {
                  const on = priorityMuscles.includes(m);
                  const disabled = !on && priorityMuscles.length >= 3;
                  return (
                    <button
                      key={m}
                      type="button"
                      disabled={disabled}
                      onClick={() => togglePriority(m)}
                      className={
                        "rounded-pill border px-3 py-1.5 text-nav transition-colors " +
                        (on
                          ? "border-accent bg-selection text-accent"
                          : disabled
                            ? "border-border-subtle text-fg-subtle"
                            : "border-border-subtle text-fg-muted hover:text-fg")
                      }
                    >
                      {muscleLabel(m)}
                    </button>
                  );
                })}
              </div>
            </Field>
          </>
        )}
      </div>

      {createPlan.isError && (
        <p className="rounded-control border border-border px-3 py-2 text-nav text-fg-soft">
          {createPlan.error.message}
        </p>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0 || createPlan.isPending}
          className="text-nav text-fg-muted transition-colors hover:text-fg disabled:opacity-40"
        >
          Back
        </button>
        {isLast ? (
          <button
            type="button"
            onClick={submit}
            disabled={createPlan.isPending}
            className="rounded-control bg-accent px-4 py-2 text-nav font-semibold text-canvas transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {createPlan.isPending ? "Building your plan…" : "Create my plan"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setStep((s) => s + 1)}
            disabled={!canContinue}
            className="rounded-control border border-border px-4 py-2 text-nav text-fg transition-colors hover:border-fg-muted disabled:opacity-40"
          >
            Continue
          </button>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-nav text-fg-muted">{label}</span>
      {children}
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-control border border-border-subtle bg-canvas px-3 py-2 text-nav text-fg outline-none focus:border-border"
      />
    </Field>
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
      className={
        "rounded-control border px-4 py-2 text-nav transition-colors " +
        (selected ? "border-accent bg-selection text-accent" : "border-border-subtle text-fg-muted hover:text-fg")
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
      className={
        "flex flex-col gap-0.5 rounded-control border px-4 py-3 text-left transition-colors " +
        (selected ? "border-accent bg-selection" : "border-border-subtle hover:border-border")
      }
    >
      <span className={"text-nav " + (selected ? "text-accent" : "text-fg")}>{title}</span>
      <span className="text-[12px] text-fg-muted">{hint}</span>
    </button>
  );
}
