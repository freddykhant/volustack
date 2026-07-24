import type { ReactNode } from "react";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { NavItem } from "./nav-item";
import type { Tab } from "./tab-strip";
import { TabStrip } from "./tab-strip";
import {
  Sparkles,
  BookOpen,
  Compass,
  Activity,
  Users,
  Settings,
  Search,
  HelpCircle,
  User,
} from "lucide-react";

type Workspace = { id: string; name: string; slug: string };

type Props = {
  slug: string;
  workspaceName: string;
  children: ReactNode;
  /** Replaces the default Column-1 nav (keep it 256px-friendly; use `appearance="neutral"` NavItems). */
  column1?: ReactNode;
  /** Contextual list column (288px). Omit on dashboards — content absorbs the space. */
  column2?: ReactNode;
  /** Hub-bar tabs (rendered left-aligned with the active underline). */
  tabs?: readonly Tab[];
  /** Right-hand table of contents (~250px), e.g. a PageToc. Hidden below xl. */
  toc?: ReactNode;
  /** Replaces the hub bar's default content entirely. */
  topNav?: ReactNode;
  /** Overrides the router pathname for active states (tests, storybook). Normally omit. */
  currentPath?: string;
  /** Opt the content column out of the 756px cap (editors, runners, playgrounds only). */
  fullBleed?: boolean;
  workspaces?: readonly Workspace[];
};

function DefaultColumnOne({
  slug,
  workspaceName,
  currentPath,
  workspaces,
}: Pick<Props, "slug" | "workspaceName" | "currentPath" | "workspaces">) {
  return (
    <>
      <WorkspaceSwitcher
        currentSlug={slug}
        currentName={workspaceName}
        workspaces={workspaces ?? [{ id: "current", name: workspaceName, slug }]}
      />
      <div className="mt-6 px-2.5 text-eyebrow font-semibold text-fg-muted">Workspace</div>
      <nav className="mt-2 flex flex-col gap-0.5">
        <NavItem appearance="neutral" href={`/${slug}/prompts`} label="Prompts" icon={Sparkles} matchPatterns={[`/${slug}/prompts`, `/${slug}/prompts/*`]} currentPath={currentPath} />
        <NavItem appearance="neutral" href={`/${slug}/playbooks`} label="Playbooks" icon={BookOpen} matchPatterns={[`/${slug}/playbooks`, `/${slug}/playbooks/*`]} currentPath={currentPath} />
        <NavItem appearance="neutral" href="/explore" label="Explore" icon={Compass} matchPatterns={["/explore", "/explore/*"]} currentPath={currentPath} />
        <NavItem appearance="neutral" href={`/${slug}/updates`} label="Updates" icon={Activity} currentPath={currentPath} />
        <NavItem appearance="neutral" href={`/${slug}/members`} label="Members" icon={Users} currentPath={currentPath} />
      </nav>
      <div className="mt-6 px-2.5 text-eyebrow font-semibold text-fg-muted">Admin Tools</div>
      <nav className="mt-2 flex flex-col gap-0.5">
        <NavItem appearance="neutral" href={`/${slug}/settings`} label="Settings" icon={Settings} matchPatterns={[`/${slug}/settings`, `/${slug}/settings/*`]} currentPath={currentPath} />
      </nav>
      <div className="mt-auto flex flex-col gap-0.5 border-t border-border-subtle pt-4">
        <NavItem appearance="neutral" href="/help" label="Help" icon={HelpCircle} currentPath={currentPath} />
        <NavItem appearance="neutral" href="/account" label="Account" icon={User} currentPath={currentPath} />
      </div>
    </>
  );
}

/** Full-viewport app frame (cloned from the ReadMe reference): 256px workspace nav (full height), a 49px hub bar spanning the rest (tabs / search / Ask AI / avatar — 32px-high, 6px-radius controls), optional 288px `column2`, 756px-capped scrollable content, and an optional `toc` column. Column 1 hides below lg, Column 2 below md, ToC below xl. Mount once per route section (in that section's layout.tsx) — never nested. */
export function AppShell({
  slug,
  workspaceName,
  children,
  column1,
  column2,
  tabs,
  toc,
  topNav,
  currentPath,
  fullBleed,
  workspaces,
}: Props) {
  return (
    <div className="flex h-screen w-full bg-canvas font-sans text-fg antialiased">
      <div className="hidden h-full min-h-0 w-64 shrink-0 flex-col p-4 lg:flex">
        {column1 ?? (
          <DefaultColumnOne
            slug={slug}
            workspaceName={workspaceName}
            currentPath={currentPath}
            workspaces={workspaces}
          />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-[49px] shrink-0 items-center gap-6 border-b border-border-subtle px-5">
          {topNav ?? (
            <>
              {tabs?.length ? <TabStrip tabs={tabs} currentPath={currentPath} /> : null}
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  className="flex h-8 items-center gap-2 rounded-control border border-border px-2.5 text-nav text-white/75 transition-colors hover:text-fg"
                >
                  <Search className="size-4" aria-hidden />
                  <span>Search</span>
                  <kbd className="text-[11px] font-semibold">⌘K</kbd>
                </button>
                <button
                  type="button"
                  className="flex h-8 items-center gap-1.5 rounded-control border border-border px-3 text-nav font-medium text-fg transition-colors hover:bg-surface"
                >
                  <Sparkles className="size-3.5" aria-hidden />
                  <span>Ask AI</span>
                </button>
                <div className="size-8 rounded-full border border-border bg-surface" aria-hidden />
              </div>
            </>
          )}
        </div>
        <div className="flex min-h-0 flex-1">
          {column2 ? (
            <div className="hidden w-72 shrink-0 overflow-y-auto p-5 md:block">{column2}</div>
          ) : null}
          <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
            {fullBleed ? children : <div className="mx-auto w-full max-w-[756px] p-8">{children}</div>}
          </main>
          {toc ? (
            <div className="hidden shrink-0 overflow-y-auto py-8 pr-6 xl:block">{toc}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
