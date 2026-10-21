"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Prints a CSS custom property's live value (read from :root), so the styleguide never hard-codes a token value. */
export function TokenValue({ name, prefix = "", className }: { name: string; prefix?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    // Compact "rgba(17, 18, 20, .035)" → "rgba(17,18,20,.035)" so values fit a swatch column.
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim().replace(/,\s+/g, ",");
    ref.current.textContent = v ? prefix + v : "n/a";
  }, [name, prefix]);
  return (
    <span ref={ref} className={className}>
      &nbsp;
    </span>
  );
}

/** A type-scale row: renders the sample with `cls`, then prints its computed size / line-height / weight. */
export function TypeRow({ token, cls, children }: { token: string; cls: string; children: ReactNode }) {
  const sample = useRef<HTMLDivElement>(null);
  const spec = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!sample.current || !spec.current) return;
    const s = getComputedStyle(sample.current);
    const lh = s.lineHeight.endsWith("px") ? Math.round(parseFloat(s.lineHeight)) : s.lineHeight;
    spec.current.textContent = `${Math.round(parseFloat(s.fontSize))} / ${lh} · ${s.fontWeight}`;
  }, []);
  return (
    <div className="grid items-baseline gap-x-6 gap-y-1 py-4 md:grid-cols-[148px_1fr]">
      <div className="flex flex-col">
        <span className="text-meta font-medium text-fg">{token}</span>
        <span ref={spec} className="text-meta text-fg-subtle tabular-nums">
          &nbsp;
        </span>
      </div>
      <div ref={sample} className={"min-w-0 text-fg " + cls}>
        {children}
      </div>
    </div>
  );
}
