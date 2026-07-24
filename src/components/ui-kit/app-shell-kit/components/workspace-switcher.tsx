"use client";
import Link from "next/link";
import { useState } from "react";
import { ChevronsUpDown, Plus, Check } from "lucide-react";

type Workspace = { id: string; name: string; slug: string };

type Props = {
  currentSlug: string;
  currentName: string;
  workspaces: readonly Workspace[];
};

/** Menu at the top of Column 1 (the logo/wordmark slot). Trigger is a full-width button; open menu is a floating canvas-bg card listing workspaces (Check marks current) plus a "New workspace" row. */
export function WorkspaceSwitcher({ currentSlug, currentName, workspaces }: Props) {
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
          <div className="px-2 pb-1 text-eyebrow font-semibold text-fg-muted">Workspaces</div>
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
