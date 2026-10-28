import type { ReactNode } from "react";

/** One numbered section of a legal page: "01  Who runs Mesodapt", then plain paragraphs. */
export function LegalSection({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  const id = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return (
    <section aria-labelledby={id} className="border-t border-border-subtle pt-8 first:border-t-0 first:pt-0">
      <div className="text-meta text-fg-subtle tabular-nums">{String(n).padStart(2, "0")}</div>
      <h2 id={id} className="mt-1.5 text-section text-fg">
        {title}
      </h2>
      <div className="mt-3 flex flex-col gap-3 text-body text-fg-soft [&_a]:text-accent [&_a]:underline-offset-2 hover:[&_a]:underline [&_b]:font-semibold [&_b]:text-fg [&_li]:ml-5 [&_li]:list-disc [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5">
        {children}
      </div>
    </section>
  );
}
