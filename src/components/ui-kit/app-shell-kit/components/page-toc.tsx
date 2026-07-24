import Link from "next/link";

export type TocItem = { label: string; href: string; active?: boolean };

type Props = { items: readonly TocItem[]; className?: string };

/** Right-hand page table of contents: 14px items on a 2px left rail; the active item renders white with an accent rail segment. Pass into AppShell's `toc` slot. */
export function PageToc({ items, className }: Props) {
  return (
    <nav className={"w-[250px] shrink-0" + (className ? " " + className : "")}>
      <ul className="flex flex-col gap-2">
        {items.map((it) => (
          <li key={it.href}>
            <Link
              href={it.href}
              aria-current={it.active ? "location" : undefined}
              className={
                "block border-l-2 pl-3 text-nav leading-[21px] transition-colors " +
                (it.active
                  ? "border-accent-strong text-fg"
                  : "border-transparent text-fg-muted hover:text-fg")
              }
            >
              {it.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
