import type { MuscleGroup, SplitType } from "~/schema";
import type { SessionSlot } from "./types";
import { ALL_MUSCLES } from "./util";

const UPPER: MuscleGroup[] = [
  "CHEST", "BACK", "TRAPS", "FRONT_DELTS", "SIDE_DELTS", "REAR_DELTS",
  "BICEPS", "TRICEPS", "FOREARMS", "ABS",
];
const LOWER: MuscleGroup[] = ["QUADS", "HAMSTRINGS", "GLUTES", "CALVES", "ABS"];
const PUSH: MuscleGroup[] = ["CHEST", "FRONT_DELTS", "SIDE_DELTS", "TRICEPS", "ABS"];
const PULL: MuscleGroup[] = ["BACK", "TRAPS", "REAR_DELTS", "BICEPS", "FOREARMS"];
const LEGS: MuscleGroup[] = ["QUADS", "HAMSTRINGS", "GLUTES", "CALVES", "ABS"];

const LETTERS = "ABCDEFG";

/** Build `daysPerWeek` sessions from a repeating group cycle. Each group base name
 * gets an incrementing letter suffix (Upper A, Upper B, ...). */
function cycle(
  groups: { base: string; muscles: MuscleGroup[] }[],
  daysPerWeek: number,
): SessionSlot[] {
  const counts = new Map<string, number>();
  const slots: SessionSlot[] = [];
  for (let i = 0; i < daysPerWeek; i++) {
    const g = groups[i % groups.length]!;
    const n = counts.get(g.base) ?? 0;
    counts.set(g.base, n + 1);
    const letter = LETTERS[n] ?? String(n + 1);
    slots.push({
      id: `${g.base.toLowerCase().replace(/\s+/g, "-")}-${letter.toLowerCase()}`,
      label: `${g.base} ${letter}`,
      eligibleMuscles: g.muscles,
    });
  }
  return slots;
}

/** Split type + day count → session slots with per-session muscle eligibility.
 * BRO_SPLIT and CUSTOM fall back to full-body eligibility for MVP generation. */
export function buildSessionSlots(splitType: SplitType, daysPerWeek: number): SessionSlot[] {
  switch (splitType) {
    case "UPPER_LOWER":
      return cycle(
        [{ base: "Upper", muscles: UPPER }, { base: "Lower", muscles: LOWER }],
        daysPerWeek,
      );
    case "PUSH_PULL_LEGS":
      return cycle(
        [
          { base: "Push", muscles: PUSH },
          { base: "Pull", muscles: PULL },
          { base: "Legs", muscles: LEGS },
        ],
        daysPerWeek,
      );
    case "FULL_BODY":
    case "BRO_SPLIT":
    case "CUSTOM":
      return cycle([{ base: "Full Body", muscles: ALL_MUSCLES }], daysPerWeek);
  }
}
