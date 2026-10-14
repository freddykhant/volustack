export interface AppliedWeek {
  weekIndex: number;
  moved: string[];
  needsChoice: boolean;
}

export interface AppliedNotice {
  text: string;
  /** Later weeks that moved or need a choice; each links to its board. */
  weekLinks: number[];
}

/** What the board tells the athlete after blocked time was saved: what moved in the
 * week on screen, and which other weeks moved or need a choice. Null when nothing did. */
export function coachAppliedNotice(
  weeks: AppliedWeek[],
  weekIndex: number,
): AppliedNotice | null {
  const here = weeks.find((w) => w.weekIndex === weekIndex);
  const other = weeks.filter((w) => w.weekIndex !== weekIndex);
  const parts = [
    ...(here && here.moved.length > 0
      ? [`Re-arranged: ${here.moved.join(", ")}.`]
      : []),
    ...other
      .filter((w) => w.moved.length > 0)
      .map((w) => `Week ${w.weekIndex}: ${w.moved.join(", ")}.`),
    ...other
      .filter((w) => w.needsChoice)
      .map((w) => `Week ${w.weekIndex} needs a choice when you open it.`),
  ];
  if (parts.length === 0) return null;
  return {
    text: parts.join(" "),
    weekLinks: other
      .filter((w) => w.moved.length > 0 || w.needsChoice)
      .map((w) => w.weekIndex),
  };
}
