import Link from "next/link";

type Props = { title: string; action?: { label: string; href: string } };

/** Section H2 (24px/600) with 42px top margin and an optional right-aligned accent action link. Every content section starts with one. */
export function SectionHeading({ title, action }: Props) {
  return (
    <div className="mt-[42px] flex items-baseline justify-between">
      <h2 className="text-section text-fg">{title}</h2>
      {action ? (
        <Link href={action.href} className="text-nav text-accent hover:underline">
          {action.label} →
        </Link>
      ) : null}
    </div>
  );
}
