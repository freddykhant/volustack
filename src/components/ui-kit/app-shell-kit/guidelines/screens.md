# Screens

Compositional examples showing how the primitives assemble into full pages. Every screen mounts inside the three-column `AppShell` from `layout.md`.

---

## Screen 1 — Workspace Dashboard

The landing page for a workspace. Mirrors the ReadMe reference's "Welcome to test-docs" article shape but populated from real workspace data.

### Structure

```
AppShell {
  column1: <ColumnOne slug={...} name={...} />
  column2: — (dashboard has no contextual list)
  topNav: — (index page, utility only)

  content: [
    PageHeader { eyebrow: "WORKSPACE", title: workspace.name }

    Callout (only if workspace is <3 days old) {
      "Welcome to <name>. Create a prompt to get started, or explore public examples."
    }

    SectionHeading { title: "Getting started" }
    CardGrid (2-col filled) [
      Card { variant: "filled", icon: Rocket,   title: "Create a Prompt",  desc: "Author, version, and share your team's prompts",  href: "/<slug>/prompts" }
      Card { variant: "filled", icon: BookOpen, title: "Build a Playbook", desc: "Stitch prompts into runnable workflows",          href: "/<slug>/playbooks" }
      Card { variant: "filled", icon: Compass,  title: "Explore Library",  desc: "Fork prompts from the community",                 href: "/explore" }
    ]

    SectionHeading { title: "Recent activity", action: { label: "View all", href: "/<slug>/updates" } }
    CardGrid (2-col ghost) [
      Card { variant: "ghost", icon: Activity, title: "<version.title>", desc: "v<n> by <author> · <relativeTime>", href: <deepLink> }
      ...up to 6 items from promptVersion.getByWorkspace
    ]

    SectionHeading { title: "Popular prompts" }
    CardGrid (2-col ghost) [
      Card { variant: "ghost", icon: Rocket, title: "<prompt.title>", desc: "<prompt.description or copyCount> copies", href: <deepLink> }
      ...up to 6 items from prompt.getByWorkspace sorted by copyCount
    ]

    Footer {
      muted "Updated less than a minute ago"
      feedback "Did this page help you?" [Yes] [No]
    }
  ]
}
```

### Visual notes

- No Column 2 — the dashboard is the "home" and doesn't have a contextual list to show. Content column absorbs the empty space naturally.
- Top nav shows only the search box + user avatar (utility strip). No tabs.
- Callout appears **only for new workspaces**. Established workspaces skip it.
- Empty states: if `Recent activity` or `Popular prompts` returns no data, render a subdued `text-body text-fg-muted` line: "Nothing yet."

### Full JSX example

```tsx
import { AppShell } from "~/components/shell/app-shell";
import { PageHeader } from "~/components/ui/page-header";
import { Callout } from "~/components/ui/callout";
import { Card } from "~/components/ui/card";
import { SectionHeading } from "~/components/ui/section-heading";
import { Rocket, BookOpen, Compass, Activity } from "lucide-react";

export default async function WorkspaceDashboard({ workspace, recent, popular }: Props) {
  const isNew = Date.now() - new Date(workspace.createdAt).getTime() < 3 * 86_400_000;

  return (
    <AppShell slug={workspace.slug} workspaceName={workspace.name}>
      <PageHeader eyebrow="Workspace" title={workspace.name} />

      {isNew && (
        <div className="mt-6">
          <Callout>
            <span className="font-semibold">Welcome to {workspace.name}.</span>{" "}
            Create a prompt to get started, or explore public examples.
          </Callout>
        </div>
      )}

      <SectionHeading title="Getting started" />
      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card variant="filled" icon={Rocket}   title="Create a Prompt"   description="Author, version, and share your team's prompts" href={`/${workspace.slug}/prompts`} />
        <Card variant="filled" icon={BookOpen} title="Build a Playbook"  description="Stitch prompts into runnable workflows"         href={`/${workspace.slug}/playbooks`} />
        <Card variant="filled" icon={Compass}  title="Explore Library"   description="Fork prompts from the community"                href="/explore" />
      </div>

      <SectionHeading title="Recent activity" action={{ label: "View all", href: `/${workspace.slug}/updates` }} />
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        {recent.length === 0
          ? <div className="col-span-full text-body text-fg-muted">Nothing yet.</div>
          : recent.map((v) => (
              <Card key={v.id} variant="ghost" icon={Activity} title={v.title} description={`v${v.versionNumber} by ${v.createdBy?.name ?? "Someone"}`} href={v.href} />
            ))}
      </div>

      <SectionHeading title="Popular prompts" />
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        {popular.length === 0
          ? <div className="col-span-full text-body text-fg-muted">Nothing yet.</div>
          : popular.map((p) => (
              <Card key={p.id} variant="ghost" icon={Rocket} title={p.title} description={p.description ?? `${p.copyCount} copies`} href={p.href} />
            ))}
      </div>
    </AppShell>
  );
}
```

---

## Screen 2 — Detail page (prompt / playbook)

A detail page uses Column 2 (contextual list — collections for prompts, playbooks list for playbooks) AND top-nav tabs (Overview / Versions / Runs / Comments / Suggestions).

### Structure

```
AppShell {
  column1: <ColumnOne />
  column2: <PromptsColumnTwo> (list of collections + prompts within selected collection)
  topNav: — (no tabs at shell level — tabs render at content-column top)

  content: [
    PageHeader { eyebrow: "PROMPT", title: prompt.title, divider: false }
    TabStrip {
      tabs: [
        { label: "Overview",     href: /prompts/x/y,               matchPatterns: [/prompts/x/y] }
        { label: "Versions",     href: /prompts/x/y#versions,      matchPatterns: [/prompts/x/y/versions, /prompts/x/y/versions/*] }
        { label: "Runs",         href: "#",  disabled: true, disabledReason: "Coming with Playground" }
        { label: "Comments",     href: "#",  disabled: true, disabledReason: "Coming with Collaboration" }
        { label: "Suggestions",  href: /prompts/x/y/suggestions,   matchPatterns: [/prompts/x/y/suggestions] }
      ]
    }

    ... prompt-specific content (body, variables, playground panel, etc.) ...
  ]
}
```

### Visual notes

- `PageHeader` sets `divider={false}` because the tab strip provides visual separation below.
- Tab strip's own container carries a `border-b border-border-subtle` so it reads as a divider.
- Disabled tabs still render (visible, greyed) with a tooltip explaining what future feature will enable them. This keeps the visual scaffold stable across the rollout.

---

## Screen 3 — Index / list page

Pages like `/prompts`, `/playbooks`, `/updates` — no tabs, no callout.

### Structure

```
AppShell {
  column1: <ColumnOne />
  column2: <SectionColumnTwo /> (per-section list)
  topNav: utility only

  content: [
    PageHeader { eyebrow: "WORKSPACE", title: "Prompts" }
    ... section-specific content: collections grid, playbook list, activity feed, etc.
  ]
}
```

### Rule

Every index page starts with `PageHeader`. The eyebrow reinforces the section context ("Workspace / Prompts") even when Column 1 already shows Prompts as the active nav item — redundancy here is a feature (helps at small widths where Column 1 is hidden).

---

## Screen 4 — Full-bleed tool (editor, runner, playground)

Escape hatch for tool-like screens that shouldn't be constrained to 756px.

### Structure

```
AppShell {
  column1: <ColumnOne />
  column2: — (typically nothing; tools take over)
  topNav: — (or minimal — just breadcrumb)

  content-slot renders directly, ignoring the 756px cap.
}
```

### When to use

- Playbook editor (two-panel author UI)
- Playbook runner (doc-inline with streaming panels)
- Prompt playground (side panel with model picker + streaming output)

### Rule

Full-bleed screens **explicitly opt out** of the content constraint by rendering into a component that ignores the `max-width` — never remove the constraint globally.
