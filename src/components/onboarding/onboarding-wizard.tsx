"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
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

const STEPS: { title: string; subtitle: string }[] = [
  { title: "About you", subtitle: "A few basics so we can tailor volume and recovery." },
  { title: "Your schedule", subtitle: "How much you can train — we'll fit the plan to it." },
  { title: "Your split", subtitle: "How you like to structure your training week." },
  { title: "Experience & priorities", subtitle: "This sets your starting template. You can fine-tune later." },
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
    });
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Brand + progress */}
      <header className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="text-eyebrow font-semibold text-fg-soft">Mesodapt</span>
          <span className="text-nav tabular-nums text-fg-subtle">
            Step {step + 1} of {STEPS.length}
          </span>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-pill bg-border-subtle">
          <div
            className="h-full rounded-pill bg-accent transition-[width] duration-300 ease-out"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </header>

      {/* Step heading */}
      <div className="flex flex-col gap-1.5">
        <h1 className="text-section text-fg">{STEPS[step]!.title}</h1>
        <p className="text-card-desc text-fg-muted">{STEPS[step]!.subtitle}</p>
      </div>

      {/* Fields */}
      <div className="flex flex-col gap-5 rounded-card border border-border bg-surface p-6">
        {step === 0 && (
          <>
            <Field label="Sex">
              <div className="grid grid-cols-2 gap-2">
                {(["MALE", "FEMALE"] as const).map((s) => (
                  <Choice key={s} selected={sex === s} onClick={() => setSex(s)}>
                    {s === "MALE" ? "Male" : "Female"}
                  </Choice>
                ))}
              </div>
            </Field>
            <NumberField label="Age" value={age} onChange={setAge} placeholder="28" />
            <div className="grid grid-cols-2 gap-4">
              <NumberField label="Height" value={heightCm} onChange={setHeightCm} placeholder="180" unit="cm" />
              <NumberField label="Weight" value={weightKg} onChange={setWeightKg} placeholder="82" unit="kg" />
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <Field label="Training days per week">
              <div className="grid grid-cols-7 gap-1.5">
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <Choice key={d} selected={daysPerWeek === d} onClick={() => setDaysPerWeek(d)}>
                    {d}
                  </Choice>
                ))}
              </div>
            </Field>
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
        )}

        {step === 3 && (
          <>
            <Field label="Experience">
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
            </Field>
            {proficiency === "BEGINNER" ? (
              <p className="rounded-control border border-border-subtle bg-canvas px-3 py-2.5 text-nav text-fg-subtle">
                Beginners train every muscle evenly — priority muscles unlock once you progress past the beginner
                template.
              </p>
            ) : (
              <Field label={`Priority muscles — optional (${priorityMuscles.length}/3)`}>
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
                              ? "cursor-not-allowed border-border-subtle text-fg-subtle opacity-50"
                              : "border-border-subtle text-fg-muted hover:border-border hover:text-fg")
                        }
                      >
                        {muscleLabel(m)}
                      </button>
                    );
                  })}
                </div>
              </Field>
            )}
          </>
        )}
      </div>

      {createPlan.isError && (
        <p className="rounded-control border border-border bg-callout px-3 py-2.5 text-nav text-fg-soft">
          {createPlan.error.message}
        </p>
      )}

      {/* Footer nav */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0 || createPlan.isPending}
          className="inline-flex items-center gap-1.5 text-nav text-fg-muted transition-colors hover:text-fg disabled:pointer-events-none disabled:opacity-0"
        >
          <ArrowLeft className="size-4" aria-hidden /> Back
        </button>
        {isLast ? (
          <button
            type="button"
            onClick={submit}
            disabled={createPlan.isPending}
            className="inline-flex items-center gap-2 rounded-control bg-accent px-4 py-2.5 text-nav font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
          >
            <Sparkles className="size-4" aria-hidden />
            {createPlan.isPending ? "Building your plan…" : "Create my plan"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setStep((s) => s + 1)}
            disabled={!canContinue}
            className="inline-flex items-center gap-2 rounded-control bg-accent px-4 py-2.5 text-nav font-medium text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
          >
            Continue <ArrowRight className="size-4" aria-hidden />
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
  unit,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  unit?: string;
}) {
  return (
    <Field label={label}>
      <div className="relative">
        <input
          type="number"
          inputMode="numeric"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={
            "w-full rounded-control border border-border-subtle bg-canvas px-3 py-2.5 text-body text-fg outline-none transition-colors placeholder:text-fg-subtle focus:border-accent " +
            (unit ? "pr-12" : "")
          }
        />
        {unit ? (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-nav text-fg-subtle">
            {unit}
          </span>
        ) : null}
      </div>
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
        "rounded-control border px-4 py-2.5 text-nav transition-colors " +
        (selected
          ? "border-accent bg-selection text-accent"
          : "border-border-subtle text-fg-muted hover:border-border hover:text-fg")
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
        "flex items-start gap-3 rounded-control border p-4 text-left transition-colors " +
        (selected ? "border-accent bg-selection" : "border-border-subtle hover:border-border")
      }
    >
      <span
        className={
          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors " +
          (selected ? "border-accent" : "border-border")
        }
        aria-hidden
      >
        {selected ? <span className="size-2 rounded-full bg-accent" /> : null}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className={"text-list " + (selected ? "text-accent" : "text-fg")}>{title}</span>
        <span className="text-nav text-fg-muted">{hint}</span>
      </span>
    </button>
  );
}
