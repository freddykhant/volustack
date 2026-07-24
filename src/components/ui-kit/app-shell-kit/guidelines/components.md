# Components

Every component here is a self-contained visual primitive. Props are TypeScript. Code samples use React + Tailwind (v4). Substitute frameworks freely — the token names + spacing are what carry over.

---

## `Card`

Two variants under one component. Both are `<a>`/`<Link>` (whole-card click target).

### Props

```ts
type Props = {
  variant: "filled" | "ghost";
  icon: LucideIcon;              // any lucide-react icon component
  title: string;
  description: string;
  href: string;
};
```

### Filled variant

Used for hero card grids on dashboards ("Getting Started" tiles, section launchers).

- Layout: icon on top → title → description (vertical)
- `bg-surface`, `border border-border`, `rounded-card`, `padding: 24px`
- Icon color `fg-muted`, shifts to `accent` on hover
- Title color `fg`, shifts to `accent` on hover
- Description color `fg-muted`
- Typical dimensions: ~245px wide × ~159px tall in a 2-column grid at 756px content width

### Ghost variant

Used for list-style rows (recent activity, popular items, "Basics" grids).

- Layout: icon on left → title + description stacked to right (horizontal)
- Transparent, no border, tighter padding
- Icon 24px, `fg-muted`, shifts to `accent` on hover
- Title 16px/600 `fg`, shifts to `accent` on hover
- Description 16px/22.4 `fg-muted`
- Typical dimensions: ~206px wide × ~67px tall

### Code

```tsx
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

type Props = {
  variant: "filled" | "ghost";
  icon: LucideIcon;
  title: string;
  description: string;
  href: string;
};

export function Card({ variant, icon: Icon, title, description, href }: Props) {
  if (variant === "filled") {
    return (
      <Link
        href={href}
        className="group flex flex-col rounded-card border border-border bg-surface p-6 transition-colors"
      >
        <Icon className="size-6 text-fg-muted transition-colors group-hover:text-accent" />
        <div className="mt-3 text-card-title text-fg transition-colors group-hover:text-accent">
          {title}
        </div>
        <div className="mt-1 text-card-desc text-fg-muted">{description}</div>
      </Link>
    );
  }
  return (
    <Link href={href} className="group flex items-start gap-3 rounded-card p-1 transition-colors">
      <Icon className="size-6 shrink-0 text-fg-muted transition-colors group-hover:text-accent" />
      <div className="min-w-0">
        <div className="text-card-title text-fg transition-colors group-hover:text-accent">
          {title}
        </div>
        <div className="text-card-desc text-fg-muted">{description}</div>
      </div>
    </Link>
  );
}
```

---

## `Callout`

Info banner with a left accent bar. One visual variant in v1 (info).

### Props

```ts
type Props = {
  icon?: LucideIcon;
  children: ReactNode;
};
```

### Spec

- `bg-callout`
- Left border: **exactly 3.5px** solid `accent-strong` (sub-pixel is intentional; do NOT round to 4px)
- `border-radius: 2px` (tight — accent bar dominates the shape)
- `padding: 20px`
- `role="note"`
- Icon (if provided) is `accent-strong`, 20px, aligned to first line of text

### Code

```tsx
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type Props = { icon?: LucideIcon; children: ReactNode };

export function Callout({ icon: Icon, children }: Props) {
  return (
    <div
      className="flex gap-3 rounded-callout bg-callout p-5 text-body text-fg"
      style={{ borderLeft: "3.5px solid var(--color-accent-strong)" }}
      role="note"
    >
      {Icon ? <Icon className="mt-0.5 size-5 shrink-0 text-accent-strong" aria-hidden /> : null}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
```

---

## `PageHeader`

The top of every content page. Eyebrow + H1 + divider.

### Props

```ts
type Props = {
  eyebrow?: string;
  title: string;
  divider?: boolean;  // default true
};
```

### Spec

- Eyebrow: `text-eyebrow` (12px/600, uppercase, `letter-spacing: 0.05em`, `fg-subtle`)
- H1: `text-page-title` (39px/50/600, `fg`)
- Divider: 1px `border-subtle`, `margin-top: 24px`

### Code

```tsx
type Props = { eyebrow?: string; title: string; divider?: boolean };

export function PageHeader({ eyebrow, title, divider = true }: Props) {
  return (
    <header className="flex flex-col gap-3">
      {eyebrow ? <div className="text-eyebrow">{eyebrow}</div> : null}
      <h1 className="text-page-title text-fg">{title}</h1>
      {divider ? <hr className="mt-6 border-border-subtle" /> : null}
    </header>
  );
}
```

---

## `SectionHeading`

H2 with optional right-aligned action link.

### Props

```ts
type Props = {
  title: string;
  action?: { label: string; href: string };
};
```

### Spec

- H2: `text-section` (22px/30.8/600, `fg`)
- `margin-top: 40px` (`mt-10`)
- Optional action: `text-nav` (14px/450), `text-accent`, hover underline; appears right-aligned, baseline-aligned with title

### Code

```tsx
import Link from "next/link";

type Props = { title: string; action?: { label: string; href: string } };

export function SectionHeading({ title, action }: Props) {
  return (
    <div className="mt-10 flex items-baseline justify-between">
      <h2 className="text-section text-fg">{title}</h2>
      {action ? (
        <Link href={action.href} className="text-nav text-accent hover:underline">
          {action.label} →
        </Link>
      ) : null}
    </div>
  );
}
```

---

## `NavItem`

Shared row primitive used in both Column 1 (workspace/admin nav) and Column 2 (sub-navigation).

### Props

```ts
type Props = {
  href: string;
  label: string;
  icon?: LucideIcon;
  matchPatterns?: string[];    // active-state route patterns; supports "/prefix/*"
  trailing?: "chevron" | null; // shows a right-aligned ChevronRight
};
```

### States

| State | Style |
|---|---|
| Default | `text-fg-muted`, no background |
| Hover | `text-fg` |
| Active | `text-accent`, `bg-selection` |
| Trailing chevron | `ChevronRight` 16px, `text-fg-subtle` |

### Spec

- Layout: `flex items-center gap-2`
- Padding: `px-2.5 py-1.5`
- Rounded: `rounded-pill`
- Font: `text-nav` (14px/450)
- Icon: 16px (`size-4`)

### Active matching

`matchPatterns` accepts exact paths (`/acme/prompts`) or prefix wildcards (`/acme/prompts/*`). If omitted, the item is active only when the current path equals `href`.

### Code

```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, type LucideIcon } from "lucide-react";

type Props = {
  href: string;
  label: string;
  icon?: LucideIcon;
  matchPatterns?: string[];
  trailing?: "chevron" | null;
};

export function isNavItemActive(currentPath: string, patterns: readonly string[]): boolean {
  for (const p of patterns) {
    if (p.endsWith("/*")) {
      const prefix = p.slice(0, -2);
      if (currentPath === prefix || currentPath.startsWith(prefix + "/")) return true;
    } else if (currentPath === p) {
      return true;
    }
  }
  return false;
}

export function NavItem({ href, label, icon: Icon, matchPatterns, trailing }: Props) {
  const pathname = usePathname();
  const patterns = matchPatterns ?? [href];
  const active = isNavItemActive(pathname, patterns);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        "flex items-center gap-2 rounded-pill px-2.5 py-1.5 text-nav transition-colors " +
        (active ? "bg-selection text-accent" : "text-fg-muted hover:text-fg")
      }
    >
      {Icon ? <Icon className="size-4" /> : null}
      <span className="flex-1">{label}</span>
      {trailing === "chevron" ? <ChevronRight className="size-4 text-fg-subtle" /> : null}
    </Link>
  );
}
```

---

## `TabStrip`

The top-nav tab-underline pattern. Used on detail pages (prompt detail, playbook detail).

### Props

```ts
type Tab = {
  href: string;
  label: string;
  icon?: LucideIcon;
  matchPatterns?: string[];
  disabled?: boolean;
  disabledReason?: string;      // shows as tooltip
};

type Props = { tabs: readonly Tab[] };
```

### States

| State | Style |
|---|---|
| Default | `text-fg-muted` |
| Hover | `text-fg` |
| Active | `text-fg`, 2px `accent` underline (positioned `-bottom-px` relative to strip container) |
| Disabled | `text-fg-subtle/60`, `cursor-not-allowed`, tooltip on hover |

### Spec

- Layout: `flex items-center gap-6`
- Tab: `py-3 text-nav`
- Underline: 2px `accent`, absolutely positioned at bottom of active tab
- Icon: 16px, `size-4`

### Code

```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { isNavItemActive } from "./nav-item";

export type Tab = {
  href: string;
  label: string;
  icon?: LucideIcon;
  matchPatterns?: string[];
  disabled?: boolean;
  disabledReason?: string;
};

export function TabStrip({ tabs }: { tabs: readonly Tab[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-6">
      {tabs.map((t) => {
        const active = isNavItemActive(pathname, t.matchPatterns ?? [t.href]);
        const Element = t.disabled ? "span" : Link;
        return (
          <Element
            key={t.href}
            href={t.disabled ? (undefined as never) : t.href}
            title={t.disabled ? t.disabledReason ?? "Coming soon" : undefined}
            className={
              "relative flex items-center gap-2 py-3 text-nav transition-colors " +
              (t.disabled
                ? "cursor-not-allowed text-fg-subtle/60"
                : active
                  ? "text-fg"
                  : "text-fg-muted hover:text-fg")
            }
          >
            {t.icon ? <t.icon className="size-4" /> : null}
            <span>{t.label}</span>
            {active && !t.disabled ? (
              <span className="absolute inset-x-0 -bottom-px h-0.5 bg-accent" />
            ) : null}
          </Element>
        );
      })}
    </nav>
  );
}
```

---

## `WorkspaceSwitcher`

Menu at the top of Column 1 — replaces the reference's logo/wordmark slot.

### Props

```ts
type Props = {
  currentSlug: string;
  currentName: string;
};
```

### Spec

- Trigger: full-width button, `text-card-title` (16px/600), `text-fg`, `ChevronsUpDown` icon right-aligned
- Menu (open): floating card, `bg-canvas`, `border border-border`, `rounded-card`, `padding: 8px`, `z-40`
- Menu items: workspace name + `Check` icon if current; `Plus` icon for "New workspace"
- Menu item: same styling as `NavItem` (Column 1) — `text-nav`, hover shifts to `bg-surface`

### Code

```tsx
"use client";
import Link from "next/link";
import { useState } from "react";
import { ChevronsUpDown, Plus, Check } from "lucide-react";

type Props = { currentSlug: string; currentName: string };
type Workspace = { id: string; name: string; slug: string };

export function WorkspaceSwitcher({
  currentSlug,
  currentName,
  workspaces,
}: Props & { workspaces: readonly Workspace[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-card px-2 py-2 text-left text-fg transition-colors hover:bg-surface"
      >
        <span className="flex-1 truncate text-card-title">{currentName}</span>
        <ChevronsUpDown className="size-4 text-fg-subtle" />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute left-0 right-0 top-full z-40 mt-1 rounded-card border border-border bg-canvas p-2"
        >
          <div className="px-2 pb-1 text-eyebrow">Workspaces</div>
          {workspaces.map((w) => (
            <Link
              key={w.id}
              href={`/${w.slug}`}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-pill px-2 py-1.5 text-nav text-fg-muted hover:bg-surface hover:text-fg"
              role="menuitem"
            >
              <span className="flex-1 truncate">{w.name}</span>
              {w.slug === currentSlug ? <Check className="size-4 text-accent" /> : null}
            </Link>
          ))}
          <hr className="my-2 border-border-subtle" />
          <Link
            href="/new-workspace"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-pill px-2 py-1.5 text-nav text-fg-muted hover:bg-surface hover:text-fg"
            role="menuitem"
          >
            <Plus className="size-4" />
            <span>New workspace</span>
          </Link>
        </div>
      ) : null}
    </div>
  );
}
```

---

## Icon reference (lucide-react)

Suggested icons for common concepts:

| Concept | Icon |
|---|---|
| Workspace switcher | `ChevronsUpDown` |
| Prompts | `Sparkles` |
| Playbooks / docs | `BookOpen` |
| Explore / discover | `Compass` |
| Activity / updates | `Activity` |
| Comments / suggestions | `MessageSquareText` |
| Members / users | `Users` |
| Settings | `Settings` |
| Search | `Search` |
| Help | `HelpCircle` |
| Account | `User` |
| Sidebar toggle | `PanelLeft` |
| Collection / folder | `Folder` |
| Prompt / doc | `FileText` |
| Version | `GitCommitHorizontal` |
| Run / play | `Play` |
| Comment thread | `MessageCircle` |
| Copy | `Copy` |
| Delete | `Trash2` |
| Add / new | `Plus` |
| Confirm / selected | `Check` |
| Right disclosure | `ChevronRight` |
| Expandable | `ChevronDown` / `ChevronUp` |
| Info callout | `Info` |
| Warning | `AlertTriangle` |
| Rocket / getting started | `Rocket` |
