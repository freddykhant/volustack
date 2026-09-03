import type { MuscleGroup } from "~/schema";

type RegionProps = { muscle: MuscleGroup; fill: string; onHover?: (m: MuscleGroup | null) => void; title: string };

function Region({ muscle, fill, onHover, title, ...rest }: RegionProps & React.SVGProps<SVGRectElement>) {
  return (
    <rect
      {...rest}
      rx={4}
      fill={fill}
      stroke="var(--color-border)"
      strokeWidth={1}
      onMouseEnter={() => onHover?.(muscle)}
      onMouseLeave={() => onHover?.(null)}
      className="cursor-pointer transition-[fill] duration-150"
    >
      <title>{title}</title>
    </rect>
  );
}

/** Stylized front+back figure. `fillFor` maps a muscle to a CSS color (zone token). */
export function BodyMap({
  fillFor,
  onHover,
}: {
  fillFor: (m: MuscleGroup) => string;
  onHover?: (m: MuscleGroup | null) => void;
}) {
  const r = (muscle: MuscleGroup, x: number, y: number, w: number, h: number, title: string) => (
    <Region muscle={muscle} x={x} y={y} width={w} height={h} fill={fillFor(muscle)} onHover={onHover} title={title} />
  );
  return (
    <svg viewBox="0 0 320 220" className="w-full" role="img" aria-label="Muscle volume body map">
      {/* FRONT */}
      <text x="70" y="14" textAnchor="middle" className="fill-[var(--color-fg-subtle)] text-[10px]">Front</text>
      {r("FRONT_DELTS", 44, 40, 52, 12, "Front delts")}
      {r("CHEST", 46, 54, 48, 22, "Chest")}
      {r("BICEPS", 30, 66, 12, 28, "Biceps")}
      {r("ABS", 54, 78, 32, 34, "Abs")}
      {r("QUADS", 48, 118, 44, 44, "Quads")}
      {r("FOREARMS", 24, 96, 12, 26, "Forearms")}
      {/* BACK */}
      <text x="250" y="14" textAnchor="middle" className="fill-[var(--color-fg-subtle)] text-[10px]">Back</text>
      {r("TRAPS", 226, 38, 48, 14, "Traps")}
      {r("REAR_DELTS", 218, 52, 16, 12, "Rear delts")}
      {r("SIDE_DELTS", 264, 52, 16, 12, "Side delts")}
      {r("BACK", 226, 54, 48, 40, "Back")}
      {r("TRICEPS", 210, 66, 12, 28, "Triceps")}
      {r("GLUTES", 228, 112, 44, 20, "Glutes")}
      {r("HAMSTRINGS", 228, 134, 44, 40, "Hamstrings")}
      {r("CALVES", 232, 178, 36, 26, "Calves")}
    </svg>
  );
}
