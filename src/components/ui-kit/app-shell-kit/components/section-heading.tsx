import Link from "next/link";

type Props = { title: string; action?: { label: string; href: string } };

/** Section H2 (20px/600) with 40px top margin and an optional right-aligned text link. */
export function SectionHeading({ title, action }: Props) {
  return (
    <div className="mt-10 mb-3 flex items-baseline justify-between">
      <h2 className="text-section text-fg">{title}</h2>
      {action ? (
        <Link href={action.href} className="text-nav text-fg-muted transition-colors hover:text-accent">
          {action.label} →
        </Link>
      ) : null}
    </div>
  );
}
