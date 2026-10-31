import { Engine } from "./engine";
import { Letter } from "./letter";
import { SiteFooter } from "./site-footer";
import { Story } from "./story";
import { TopBar } from "./top-bar";
import { WeekDiary } from "./week-diary";

/** Signed-out landing. The session redirect lives in `page.tsx`; this is markup only. */
export function Landing() {
  return (
    <div id="top" className="bg-atmosphere flex min-h-screen flex-col">
      <TopBar />
      <main id="main" className="flex-1">
        <Story />
        <WeekDiary />
        <Engine />
        <Letter />
      </main>
      <SiteFooter />
    </div>
  );
}
