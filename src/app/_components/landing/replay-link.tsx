"use client";

import { buttonClass } from "~/components/ui-kit/app-shell-kit";
import { REPLAY_EVENT } from "./week-demo";

/** Back to the hero, and play the week again once it's there. */
export function ReplayLink() {
  return (
    <a
      href="#top"
      className={buttonClass("secondary", "lg")}
      onClick={() => window.dispatchEvent(new Event(REPLAY_EVENT))}
    >
      See how it adapts ↑
    </a>
  );
}
