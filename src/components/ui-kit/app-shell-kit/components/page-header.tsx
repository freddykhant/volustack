import type { ReactNode } from "react";

type Props = {
  eyebrow?: string;
  title: string;
  /** One quiet line under the title (status, counts). */
  description?: ReactNode;
  /** Right-aligned slot level with the title: a Segmented control or one Button. */
  actions?: ReactNode;
  /** Hairline under the header. Off by default — whitespace separates. */
  divider?: boolean;
};

/** Top of every content page: uppercase eyebrow, 30px H1, optional description and actions. Exactly one per page. */
export function PageHeader({ eyebrow, title, description, actions, divider = false }: Props) {
  return (
    <header className="animate-rise">
      {eyebrow ? <div className="mb-1.5 text-eyebrow font-medium text-fg-subtle">{eyebrow}</div> : null}
      <div className="flex items-end justify-between gap-4">
        <h1 className="text-page-title text-fg">{title}</h1>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {description ? <div className="mt-1.5 text-body text-fg-muted">{description}</div> : null}
      {divider ? <hr className="mt-6 border-border" /> : null}
    </header>
  );
}
