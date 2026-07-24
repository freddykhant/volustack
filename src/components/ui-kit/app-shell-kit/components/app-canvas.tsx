import type { ReactNode } from "react";

type Props = { children: ReactNode; className?: string };

/** Dark canvas root for app-DS content outside the full AppShell: applies `bg-canvas`, the system font stack, and body text defaults. Wrap any standalone composition in this. */
export function AppCanvas({ children, className }: Props) {
  return (
    <div className={"bg-canvas font-sans text-body text-fg antialiased" + (className ? " " + className : "")}>
      {children}
    </div>
  );
}
