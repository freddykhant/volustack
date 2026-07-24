type Props = { eyebrow?: string; title: string; divider?: boolean };

/** Top of every content page: uppercase eyebrow (12px/500, fg-soft) + 39px H1 + optional 1px divider (default on). Set `divider={false}` when a TabStrip follows. */
export function PageHeader({ eyebrow, title, divider = true }: Props) {
  return (
    <header className="flex flex-col gap-3">
      {eyebrow ? <div className="text-eyebrow font-medium text-fg-soft">{eyebrow}</div> : null}
      <h1 className="text-page-title text-fg">{title}</h1>
      {divider ? <hr className="mt-6 border-border" /> : null}
    </header>
  );
}
