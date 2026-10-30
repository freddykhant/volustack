import type { ReactNode } from "react";

/** Shared building blocks for the landing sections. Server components; markup only. */

export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={"mx-auto w-full max-w-[1120px] px-4 sm:px-8" + (className ? " " + className : "")}>
      {children}
    </div>
  );
}

/** One landing block. Always labelled by its own heading so landmarks read sensibly. */
export function LandingSection({
  id,
  labelledBy,
  className,
  children,
}: {
  id?: string;
  labelledBy: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={"relative" + (className ? " " + className : "")}>
      {children}
    </section>
  );
}
