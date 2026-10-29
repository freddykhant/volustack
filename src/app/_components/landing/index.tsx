import { BlockStory } from "./block-story";
import { ClosingCta } from "./closing-cta";
import { Engine } from "./engine";
import { Hero } from "./hero";
import { HowItWorks } from "./how-it-works";
import { Problem } from "./problem";
import { SiteFooter } from "./site-footer";
import { TopBar } from "./top-bar";

/** Signed-out landing. The session redirect lives in `page.tsx`; this is markup only. */
export function Landing() {
  return (
    <div id="top" className="bg-atmosphere flex min-h-screen flex-col">
      <TopBar />
      <main id="main" className="flex-1">
        <Hero />
        <Problem />
        <HowItWorks />
        <Engine />
        <BlockStory />
        <ClosingCta />
      </main>
      <SiteFooter />
    </div>
  );
}
