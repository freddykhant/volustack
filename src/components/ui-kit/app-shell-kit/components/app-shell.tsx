import type { ReactNode } from "react";
import type { Tab } from "./tab-strip";
import { TabStrip } from "./tab-strip";

type Props = {
  children: ReactNode;
  /** Column 1: the app nav (240px). Use `appearance="neutral"` NavItems. */
  column1: ReactNode;
  /** Contextual list column (256px). Omit on dashboards — content absorbs the space. */
  column2?: ReactNode;
  /** Optional tabs in a slim top bar over the content column. */
  tabs?: readonly Tab[];
  /** Optional right-hand table of contents (~250px), e.g. a PageToc. Hidden below xl. */
  toc?: ReactNode;
  /** Optional custom top bar content. When neither `topNav` nor `tabs` is given there is no top bar. */
  topNav?: ReactNode;
  /** Overrides the router pathname for active states (tests, storybook). Normally omit. */
  currentPath?: string;
  /** Opt the content column out of the 800px cap (week board, block grid, analysis). */
  fullBleed?: boolean;
};

/** Full-viewport app frame on the warm canvas: 240px nav column, optional 256px contextual column,
 *  and one scrolling content column that carries the page's atmosphere glow. Content is capped at
 *  800px unless `fullBleed`. Mount once per route section (in that section's layout.tsx) — never nested. */
export function AppShell({ children, column1, column2, tabs, toc, topNav, currentPath, fullBleed }: Props) {
  const hasTopBar = Boolean(topNav ?? tabs?.length);
  return (
    <div className="flex h-screen w-full bg-canvas font-sans text-fg antialiased">
      <div className="hidden h-full min-h-0 w-60 shrink-0 flex-col px-3 py-4 lg:flex">{column1}</div>
      <div className="flex min-w-0 flex-1 flex-col lg:border-l lg:border-border-subtle">
        {hasTopBar ? (
          <div className="flex h-[52px] shrink-0 items-center gap-6 border-b border-border-subtle px-6">
            {topNav ?? (tabs?.length ? <TabStrip tabs={tabs} currentPath={currentPath} /> : null)}
          </div>
        ) : null}
        <div className="flex min-h-0 flex-1">
          {column2 ? (
            <div className="hidden w-64 shrink-0 overflow-y-auto border-r border-border-subtle px-3 py-5 md:block">
              {column2}
            </div>
          ) : null}
          <main className="bg-atmosphere min-h-0 min-w-0 flex-1 overflow-y-auto">
            {fullBleed ? (
              children
            ) : (
              <div className="mx-auto w-full max-w-[800px] px-6 pt-10 pb-20 md:px-10">{children}</div>
            )}
          </main>
          {toc ? <div className="hidden shrink-0 overflow-y-auto py-10 pr-6 xl:block">{toc}</div> : null}
        </div>
      </div>
    </div>
  );
}
