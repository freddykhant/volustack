import type { CoachNote } from "~/views/types";

const TONE: Record<CoachNote["tone"], string> = {
  info: "text-fg-muted",
  caution: "text-fg-soft",
  positive: "text-fg-soft",
};

export function CoachCard({ notes }: { notes: CoachNote[] }) {
  if (notes.length === 0) return null;
  return (
    <div className="rounded-card border border-border bg-surface p-6">
      <div className="text-eyebrow font-medium text-fg-soft">Coach</div>
      <ul className="mt-3 flex flex-col gap-3">
        {notes.map((note) => (
          <li key={note.id} className={`text-card-desc ${TONE[note.tone]}`}>
            {note.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
