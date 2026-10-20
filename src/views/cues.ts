import { cueId, type CueFact, type CueKind, type CueSubject, type GramRange } from "~/engine";

export type CueWhen = "today" | "tomorrow";

export interface CueView {
  id: string;
  date: string;
  when: CueWhen;
  kind: CueKind;
  title: string;
  line: string;
  /** Whether the line carries a number; the card shows its footer only then. */
  hasNumber: boolean;
}

export const CUE_FOOTER = "Based on your bodyweight and phase. A guide, not a meal plan.";

const NOUN = { RUN: "run", RIDE: "ride", SWIM: "swim", SPORT: "game", OTHER: "activity" } as const;

/** How a subject is named mid-sentence: a session by its label, an activity by what it was.
 * An easy activity only reaches a cue when it was long, so it is called that. */
function named(s: CueSubject): string {
  if (s.type === "lift") return s.label;
  const adj = s.intensity === "HARD" ? "hard " : s.intensity === "EASY" ? "long easy " : "";
  return `${adj}${NOUN[s.kind]}`;
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const grams = (r: GramRange) => `${r[0]}–${r[1]} g`;

/** Two wordings per line, chosen by the cue's id so one cue always reads the same. */
function pick(id: string, options: readonly [string, string]): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return options[h % 2]!;
}

export function toCueView(fact: CueFact, when: CueWhen): CueView {
  const id = cueId(fact);
  const base = { id, date: fact.date, when, kind: fact.kind };
  switch (fact.kind) {
    case "fuel_between": {
      const title =
        fact.order === "known"
          ? `${cap(named(fact.first))}, then ${named(fact.second)}`
          : `${cap(named(fact.first))} and ${named(fact.second)} on the same day`;
      const line = fact.carbsG
        ? pick(id, [
            `Aim for roughly ${grams(fact.carbsG)} of carbs between them.`,
            `Get roughly ${grams(fact.carbsG)} of carbs in between the two.`,
          ])
        : pick(id, ["Fit a carb-rich meal between them.", "Make carbs a priority between the two."]);
      return { ...base, title, line, hasNumber: fact.carbsG !== null };
    }
    case "recovery_overlap": {
      const [before, day] = when === "today" ? ["yesterday", "today"] : ["today", "tomorrow"];
      const title = `${cap(named(fact.yesterday))} ${before}, ${named(fact.today)} ${day}`;
      const line = fact.proteinG
        ? pick(id, [
            `Give the warm-up extra time and get ${grams(fact.proteinG)} of protein afterwards.`,
            `Ease into the first sets and get ${grams(fact.proteinG)} of protein afterwards.`,
          ])
        : pick(id, [
            "Give the warm-up extra time and make the next meal protein-rich.",
            "Ease into the first sets and get a protein-rich meal afterwards.",
          ]);
      return { ...base, title, line, hasNumber: fact.proteinG !== null };
    }
    case "heavy_lower": {
      const hours = `${fact.mealHoursBefore[0]}–${fact.mealHoursBefore[1]} hours`;
      const sets = `${fact.lift.label} has ${fact.lowerSets} lower-body sets`;
      const line = fact.carbsG
        ? pick(id, [
            `${sets}: aim for roughly ${grams(fact.carbsG)} of carbs in the meal ${hours} before.`,
            `${sets}: get roughly ${grams(fact.carbsG)} of carbs in ${hours} beforehand.`,
          ])
        : pick(id, [`${sets}: make the meal ${hours} before carb-rich.`, `${sets}: get a carb-rich meal in ${hours} beforehand.`]);
      return { ...base, title: "Big lower-body day", line, hasNumber: fact.carbsG !== null };
    }
  }
}
